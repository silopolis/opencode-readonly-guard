import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { agentRules, hasOpencode, pluginUrl, requireBuild, sandbox, type Sandbox } from "../helpers.js"

setDefaultTimeout(180_000)

let box: Sandbox
beforeEach(() => {
  requireBuild()
  box = sandbox()
})
afterEach(() => box.cleanup())

const bash = (rules: ReturnType<typeof agentRules>) => rules.filter((rule) => rule.permission === "bash")
const lastFor = (rules: ReturnType<typeof agentRules>, permission: string) =>
  rules.findLast((rule) => rule.permission === permission)

describe.skipIf(!hasOpencode)("plugin loaded by opencode", () => {
  test("is listed in the resolved config, with the review command", () => {
    const run = box.opencode(["debug", "config"])
    expect(run.status).toBe(0)
    const config = JSON.parse(run.stdout) as {
      plugin_origins: { spec: string }[]
      command: Record<string, { agent: string; template: string }>
    }
    expect(config.plugin_origins.map((origin) => origin.spec)).toContain(pluginUrl)
    expect(config.command["guard-review"].agent).toBe("build")
    expect(config.command["guard-review"].template).toContain("readonly_guard_review")
  })

  test("plan and explore get the read-only bash policy", () => {
    for (const agent of ["plan", "explore"]) {
      const rules = agentRules(box, agent)
      const patterns = bash(rules).map((rule) => `${rule.pattern}=${rule.action}`)
      expect(patterns).toContain("*=ask")
      expect(patterns).toContain("git log*=allow")
      expect(patterns).toContain("*-delete*=ask")
      // herdr: reads are allowed, instructions to other agents and the UI commands are not
      expect(patterns).toContain("herdr agent list *=allow")
      expect(patterns).toContain("herdr agent prompt *=ask")
      expect(patterns).not.toContain("herdr tab rename *=allow")
      expect(patterns).not.toContain("herdr notification show *=allow")
      // the ask flags come after every allow rule, so they win; only exact `<subcommand> --help` rules follow them
      const list = bash(rules)
      const lastWildcard = list.findLastIndex((rule) => /[*?]/.test(rule.pattern))
      expect(list[lastWildcard]?.action).toBe("ask")
      const after = list.slice(lastWildcard + 1)
      expect(after.length).toBeGreaterThan(50)
      expect(after.every((rule) => rule.action === "allow" && rule.pattern.endsWith(" --help"))).toBe(true)
      expect(patterns).toContain("herdr worktree create --help=allow")
      expect(lastFor(rules, "readonly_guard_review")?.action).toBe("deny")
    }
  })

  test("plan may only delegate to read-only subagents without asking", () => {
    const task = agentRules(box, "plan").filter((rule) => rule.permission === "task")
    expect(task.map((rule) => `${rule.pattern}=${rule.action}`)).toEqual(
      expect.arrayContaining(["*=ask", "general=deny", "explore=allow"]),
    )
  })

  test("build is untouched, but any change to the allowlist still needs a prompt", () => {
    const rules = agentRules(box, "build")
    expect(bash(rules)).toEqual([])
    expect(lastFor(rules, "readonly_guard_allow")?.action).toBe("ask")
  })

  test("a custom agent with edit denied is detected", () => {
    box.write(
      ".opencode/agents/auditor.md",
      "---\ndescription: audits\nmode: subagent\npermission:\n  edit: deny\n---\nAudit.\n",
    )
    expect(bash(agentRules(box, "auditor")).length).toBeGreaterThan(20)
  })

  test("learned rules are applied at startup, unsafe ones are ignored and logged", () => {
    box.writeStore({ allow: ["whoami *", "rm *"] })
    const rules = bash(agentRules(box, "plan"))
    expect(rules).toContainEqual({ permission: "bash", pattern: "whoami *", action: "allow" })
    expect(rules.some((rule) => rule.pattern === "rm *")).toBe(false)
    expect(box.events().some((event) => event.type === "error" && String(event.error).includes("rm"))).toBe(true)
  })

  test("herdr: outside a herdr pane the UI commands ask, even when the user lists them", () => {
    box.writeStore({ allow: ["herdr tab rename *", "herdr notification show *", "whoami *"] })
    const rules = bash(agentRules(box, "plan"))
    expect(rules.some((rule) => rule.pattern.startsWith("herdr tab rename") && rule.action === "allow")).toBe(false)
    expect(rules.some((rule) => rule.pattern.startsWith("herdr notification show") && rule.action === "allow")).toBe(
      false,
    )
    expect(rules).toContainEqual({ permission: "bash", pattern: "whoami *", action: "allow" })
    expect(box.events().find((event) => event.type === "init")).toMatchObject({ learned: 1, presets: [] })
  })

  test("herdr: inside a herdr pane the herdr-ui preset allows the UI commands and nothing next to them", () => {
    box.cleanup()
    box = sandbox({ herdr: true })
    const rules = bash(agentRules(box, "plan"))
    for (const pattern of ["herdr tab rename *", "herdr notification show *"]) {
      expect(rules).toContainEqual({ permission: "bash", pattern, action: "allow" })
    }
    for (const pattern of ["herdr agent prompt *", "herdr pane send-text *", "herdr tab close *"]) {
      expect(rules.findLast((rule) => rule.pattern === pattern)?.action).toBe("ask")
    }
    expect(rules).toContainEqual({ permission: "bash", pattern: "herdr agent list *", action: "allow" })
    expect(box.events().find((event) => event.type === "init")).toMatchObject({ learned: 0, presets: ["herdr-ui"] })
  })

  test("herdr: the preset can be switched off in the store or the plugin options, and one command listed instead", () => {
    box.cleanup()
    box = sandbox({ herdr: true })
    box.writeStore({
      presets: { "herdr-ui": false },
      allow: ["herdr tab rename *", "herdr pane send-text *"],
    })
    const rules = bash(agentRules(box, "plan"))
    expect(rules).toContainEqual({ permission: "bash", pattern: "herdr tab rename *", action: "allow" })
    expect(rules.some((rule) => rule.pattern.startsWith("herdr notification show") && rule.action === "allow")).toBe(
      false,
    )
    // refused even when listed: it can never be learned
    expect(rules.some((rule) => rule.pattern === "herdr pane send-text *" && rule.action === "allow")).toBe(false)
    expect(rules.findLast((rule) => rule.pattern === "herdr pane send-text *")?.action).toBe("ask")
    expect(
      box.events().some((event) => event.type === "error" && String(event.error).includes("herdr pane send-text")),
    ).toBe(true)
    expect(box.events().find((event) => event.type === "init")).toMatchObject({ learned: 1, presets: [] })

    box.cleanup()
    box = sandbox({ herdr: true, plugin: [pluginUrl, { presets: { "herdr-ui": false } }] })
    const off = bash(agentRules(box, "plan"))
    expect(off.some((rule) => rule.pattern.startsWith("herdr tab rename") && rule.action === "allow")).toBe(false)
    expect(box.events().find((event) => event.type === "init")).toMatchObject({ presets: [] })
  })

  test("herdr: the rules file in herdr's config directory is read inside herdr only", () => {
    const file = { presets: { "herdr-ui": false }, allow: ["herdr notification show *", "herdr agent prompt *"] }
    box.cleanup()
    box = sandbox({ herdr: true })
    box.writeHerdrFile(file)
    const inside = bash(agentRules(box, "plan"))
    expect(inside).toContainEqual({ permission: "bash", pattern: "herdr notification show *", action: "allow" })
    expect(inside.some((rule) => rule.pattern.startsWith("herdr tab rename") && rule.action === "allow")).toBe(false)
    expect(inside.findLast((rule) => rule.pattern === "herdr agent prompt *")?.action).toBe("ask")
    expect(box.events().find((event) => event.type === "init")).toMatchObject({ learned: 1, presets: [] })
    expect(box.events().some((event) => event.type === "error" && event.where === "herdr config")).toBe(true)

    // the same files, outside herdr: not read, nothing allowed
    box.cleanup()
    box = sandbox()
    box.writeHerdrFile(file)
    const outside = bash(agentRules(box, "plan"))
    expect(outside.some((rule) => rule.pattern.startsWith("herdr notification show") && rule.action === "allow")).toBe(
      false,
    )
    expect(box.events().find((event) => event.type === "init")).toMatchObject({ learned: 0, presets: [] })
  })

  test("startup is logged with the read-only agents", () => {
    agentRules(box, "plan")
    const init = box.events().find((event) => event.type === "init")
    expect(init?.roAgents).toEqual(["plan", "explore"])
  })

  test("options from opencode.json are honoured", () => {
    box.cleanup()
    box = sandbox({ plugin: [pluginUrl, { allow: ["id -un"], command: false }] })
    expect(bash(agentRules(box, "plan"))).toContainEqual({ permission: "bash", pattern: "id -un", action: "allow" })
    const config = JSON.parse(box.opencode(["debug", "config"]).stdout) as { command?: Record<string, unknown> }
    expect(config.command?.["guard-review"]).toBeUndefined()
  })
})
