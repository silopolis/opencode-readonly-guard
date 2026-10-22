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
      // the ask flags come after every allow rule, so they win
      const last = bash(rules).at(-1)
      expect(last?.action).toBe("ask")
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
