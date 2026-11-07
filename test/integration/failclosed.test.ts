import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { agentRules, copyPlugin, hasOpencode, pluginUrl, requireBuild, sandbox, type Sandbox } from "../helpers.js"

setDefaultTimeout(180_000)

/** The file opencode imports for a plugin directory: its `exports["./server"]`. */
const moduleOf = (spec: string) => pathToFileURL(join(fileURLToPath(spec), "dist", "index.js")).href

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const step of cleanup.splice(0)) step()
})

/** A copy of the built plugin with one rule file corrupted, and its `file://` spec. */
function brokenCopy(file: string): string {
  requireBuild()
  const dir = mkdtempSync(join(tmpdir(), "rg-broken-"))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const spec = copyPlugin(dir)
  writeFileSync(join(dir, "rules", file), "{ not json")
  return spec
}

function track(box: Sandbox): Sandbox {
  cleanup.push(() => box.cleanup())
  return box
}

const bash = (box: Sandbox, agent: string) =>
  agentRules(box, agent)
    .filter((rule) => rule.permission === "bash")
    .map((rule) => `${rule.pattern}=${rule.action}`)
/** The bash rules that apply: opencode lists an agent's built-in rules (explore's `* allow`) first, the last match wins. */
const effective = (rules: string[]) => rules.slice(rules.findLastIndex((rule) => rule.startsWith("*=")))

// opencode drops a plugin whose server() throws, leaving plan and explore with bash: allow and no write guard.
describe.skipIf(!hasOpencode)("a copy whose rule files are corrupt", () => {
  test("allow.json: read-only agents ask before every command, the write guard stays on", () => {
    const spec = brokenCopy("allow.json")
    const box = track(sandbox({ plugin: spec }))
    box.write(
      ".opencode/agents/auditor.md",
      '---\ndescription: audits\nmode: subagent\npermission:\n  edit: deny\n  bash:\n    "*": ask\n    "rm *": deny\n---\nAudit.\n',
    )
    for (const agent of ["plan", "explore"]) expect(effective(bash(box, agent))).toEqual(["*=ask"])
    expect(effective(bash(box, "auditor"))).toEqual(["*=ask", "rm *=deny"])
    expect(agentRules(box, "plan").findLast((rule) => rule.permission === "readonly_guard_review")?.action).toBe("deny")
    const config = JSON.parse(box.opencode(["debug", "config"]).stdout) as { command?: Record<string, unknown> }
    expect(config.command?.["guard-review"]).toBeUndefined()
    const errors = box.events().filter((event) => event.type === "error")
    expect(errors.length).toBeGreaterThan(0)
    for (const error of errors) {
      expect(error).toMatchObject({ where: "load", writeGuard: true, module: moduleOf(spec) })
      expect(String(error.error)).toContain("cannot load allow.json")
    }
    expect(box.events().some((event) => event.type === "init")).toBe(false)
  })

  test("commands.json: read-only agents ask before every command, and the log says the write guard is off", () => {
    const box = track(sandbox({ plugin: brokenCopy("commands.json") }))
    expect(effective(bash(box, "plan"))).toEqual(["*=ask"])
    const [error] = box.events()
    expect(error).toMatchObject({ type: "error", where: "load", writeGuard: false })
    expect(String(error.error)).toContain("cannot load commands.json")
  })

  test("behind a copy that started, the broken copy stays passive and is named in the init event", () => {
    const global = brokenCopy("allow.json")
    const box = track(sandbox({ globalPlugin: global }))
    expect(bash(box, "plan")).toContain("git log*=allow")
    expect(box.events().filter((event) => event.type === "error")).toEqual([])
    const [init] = box.events()
    expect(init).toMatchObject({
      type: "init",
      module: moduleOf(pluginUrl),
      copies: [moduleOf(pluginUrl)],
      failed: [{ module: moduleOf(global), error: expect.stringContaining("cannot load allow.json") }],
    })
  })
})
