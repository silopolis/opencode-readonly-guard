import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  agentRules,
  copyPlugin,
  hasOpencode,
  pluginUrl,
  registeredToolIds,
  requireBuild,
  sandbox,
  type Sandbox,
} from "../helpers.js"

setDefaultTimeout(180_000)

/** The file opencode imports for a plugin directory: its `exports["./server"]`. */
const moduleOf = (spec: string) => pathToFileURL(join(fileURLToPath(spec), "dist", "index.js")).href

// Two entries with different specs (a global install and a project entry, or two checkouts) load two copies of the
// plugin into one opencode instance. opencode only merges identical specs, so the plugin settles it itself.
describe.skipIf(!hasOpencode)("two copies of the plugin in one opencode", () => {
  let box: Sandbox
  let copyDir: string
  let globalCopy: string
  beforeEach(() => {
    requireBuild()
    copyDir = mkdtempSync(join(tmpdir(), "rg-copy-"))
    globalCopy = copyPlugin(copyDir)
    box = sandbox({
      plugin: [pluginUrl, { allow: ["id -un"], agents: { exclude: ["explore"] } }],
      globalPlugin: [globalCopy, { allow: ["whoami *"], command: "global-review" }],
    })
  })
  afterEach(() => {
    box.cleanup()
    rmSync(copyDir, { recursive: true, force: true })
  })

  test("the project's copy applies its own options, and only once", () => {
    const plan = agentRules(box, "plan").filter((rule) => rule.permission === "bash")
    expect(plan).toContainEqual({ permission: "bash", pattern: "id -un", action: "allow" })
    expect(plan.some((rule) => rule.pattern === "whoami *")).toBe(false)
    // excluded by the project's options, so neither copy touched it
    expect(agentRules(box, "explore").some((rule) => rule.permission === "readonly_guard_review")).toBe(false)

    const config = JSON.parse(box.opencode(["debug", "config"]).stdout) as { command?: Record<string, unknown> }
    expect(Object.keys(config.command ?? {})).toEqual(["guard-review"])

    // one opencode process per command above: one init each, by the project's copy, which saw both
    const inits = box.events().filter((event) => event.type === "init")
    expect(inits).toHaveLength(3)
    for (const init of inits) {
      expect(init).toMatchObject({
        roAgents: ["plan"],
        learned: 1,
        module: moduleOf(pluginUrl),
        copies: [moduleOf(globalCopy), moduleOf(pluginUrl)],
      })
    }
  })

  test("the review tools are registered once", async () => {
    const ids = await registeredToolIds(box)
    expect(ids.filter((id) => id === "readonly_guard_review")).toHaveLength(1)
    expect(ids.filter((id) => id === "readonly_guard_update")).toHaveLength(1)
  })
})
