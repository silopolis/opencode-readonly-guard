import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { agentRules, childEnv, copyPlugin, hasOpencode, requireBuild, sandbox, type Sandbox } from "../helpers.js"

setDefaultTimeout(180_000)

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const step of cleanup.splice(0)) step()
})

/** A copy of the built plugin, changed by `change` (given its directory), and its `file://` spec. */
function copy(change: (dir: string) => void): string {
  requireBuild()
  const dir = mkdtempSync(join(tmpdir(), "rg-builtin-"))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const spec = copyPlugin(dir)
  change(dir)
  return spec
}
const corrupt = (...files: string[]) =>
  copy((dir) => files.forEach((file) => writeFileSync(join(dir, "rules", file), "{ not json")))

function track(box: Sandbox): Sandbox {
  cleanup.push(() => box.cleanup())
  return box
}

const bash = (box: Sandbox, agent: string) =>
  agentRules(box, agent)
    .filter((rule) => rule.permission === "bash")
    .map((rule) => `${rule.pattern}=${rule.action}`)

/** The full policy: the shared allowlist, the always-ask flags and the help layer. */
function expectFullPolicy(box: Sandbox): void {
  for (const agent of ["plan", "explore"]) {
    const rules = bash(box, agent)
    expect(rules).toContain("git log*=allow")
    expect(rules).toContain("*-delete*=ask")
    expect(rules).toContain("herdr worktree create --help=allow")
  }
}

// opencode drops a plugin whose server() throws: a corrupt rule file used to leave plan and explore with bash: allow.
describe.skipIf(!hasOpencode)("a copy whose rule files cannot be read uses the copy built into it", () => {
  test("allow.json: the full policy, the review command, and the file named in the log", () => {
    const box = track(sandbox({ plugin: corrupt("allow.json") }))
    expectFullPolicy(box)
    const config = JSON.parse(box.opencode(["debug", "config"]).stdout) as { command?: Record<string, unknown> }
    expect(config.command?.["guard-review"]).toBeDefined()
    const events = box.events()
    expect(events.length).toBeGreaterThan(0)
    for (const event of events) {
      if (event.type === "init") expect(event.builtin).toEqual(["allow.json"])
      else {
        expect(event).toMatchObject({ type: "error", where: "rules", file: "allow.json" })
        expect(String(event.error)).toContain("cannot load allow.json")
      }
    }
    expect(events.filter((event) => event.type === "init")).toHaveLength(events.length / 2)
  })

  test("commands.json and ask.json: the same", () => {
    const box = track(sandbox({ plugin: corrupt("commands.json", "ask.json") }))
    expectFullPolicy(box)
    expect(box.events().find((event) => event.type === "init")?.builtin).toEqual(["ask.json", "commands.json"])
  })

  test("no rules/ directory at all: the same", () => {
    const box = track(sandbox({ plugin: copy((dir) => rmSync(join(dir, "rules"), { recursive: true })) }))
    expectFullPolicy(box)
    expect(box.events().find((event) => event.type === "init")?.builtin).toEqual([
      "allow.json",
      "ask.json",
      "commands.json",
    ])
  })
})

describe("the command-line tool without its rule files", () => {
  test("decides with the copy built into it, and says so", () => {
    const spec = copy((dir) => rmSync(join(dir, "rules"), { recursive: true }))
    const cli = join(fileURLToPath(spec), "dist", "cli.js")
    const run = (command: string) =>
      spawnSync("node", [cli, "check", "--no-store", command], { encoding: "utf8", env: childEnv() })
    const blocked = run("rm -rf build")
    expect(blocked.status).toBe(2)
    expect(blocked.stdout).toContain('"rm" modifies files')
    expect(blocked.stderr).toContain("warning: readonly-guard: cannot load commands.json")
    expect(blocked.stderr).toContain("using the copy built into the tool")
    expect(run("git log --oneline").status).toBe(0)
  })
})
