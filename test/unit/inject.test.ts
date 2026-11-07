import { describe, expect, test } from "bun:test"
import { PERMISSION_CONFIRM, TOOL_REVIEW, TOOL_UPDATE } from "../../src/constants.js"
import { failClosed, injectRules, isEditDenied, type MutableConfig } from "../../src/inject.js"
import { loadRules } from "../../src/rules.js"
import { evaluate, type RuleEntry } from "../../src/wildcard.js"

const rules = loadRules()
const run = (config: MutableConfig, extra: Partial<Parameters<typeof injectRules>[1]> = {}) =>
  injectRules(config, { rules, learned: [], include: [], exclude: [], ...extra })
const bash = (config: MutableConfig, agent: string): RuleEntry[] => {
  const permission = config.agent?.[agent]?.permission as
    | { bash?: Record<string, "ask" | "allow" | "deny"> }
    | undefined
  if (!permission?.bash) throw new Error(`no bash rules for ${agent}`)
  return Object.entries(permission.bash)
}

describe("isEditDenied", () => {
  test("recognises the ways an agent can be made read-only", () => {
    expect(isEditDenied({ permission: "deny" })).toBe(true)
    expect(isEditDenied({ permission: { edit: "deny" } })).toBe(true)
    expect(isEditDenied({ permission: { edit: { "*": "deny" } } })).toBe(true)
    expect(isEditDenied({ tools: { edit: false } })).toBe(true)
  })

  test("everything else is not read-only", () => {
    expect(isEditDenied(undefined)).toBe(false)
    expect(isEditDenied({})).toBe(false)
    expect(isEditDenied({ permission: "allow" })).toBe(false)
    expect(isEditDenied({ permission: { edit: "ask" } })).toBe(false)
    expect(isEditDenied({ permission: { edit: { "*": "allow", "docs/*": "deny" } } })).toBe(false)
  })
})

describe("injectRules", () => {
  test("plan and explore are always read-only, even when absent from the config", () => {
    const config: MutableConfig = {}
    expect([...run(config)].toSorted()).toEqual(["explore", "plan"])
    expect(evaluate("uptime", bash(config, "explore"))).toBe("ask")
    expect(evaluate("ls -la", bash(config, "plan"))).toBe("allow")
  })

  test("other agents are left alone and not created", () => {
    const config: MutableConfig = { agent: { build: { permission: { bash: "allow" } } } }
    run(config, { include: ["ghost"] })
    expect(config.agent?.build).toEqual({ permission: { bash: "allow" } })
    expect(config.agent?.ghost).toBeUndefined()
  })

  test("agents with edit denied are detected; include adds existing agents; exclude removes", () => {
    const config: MutableConfig = {
      agent: {
        reviewer: { permission: { edit: "deny" } },
        auditor: {},
        ignored: { permission: { edit: "deny" } },
      },
    }
    const names = run(config, { include: ["auditor"], exclude: ["ignored", "explore"] })
    expect([...names].toSorted()).toEqual(["auditor", "plan", "reviewer"])
    expect(config.agent?.ignored?.permission).toEqual({ edit: "deny" })
  })

  test("learned rules allow more but ask flags still win", () => {
    const config: MutableConfig = {}
    run(config, { learned: ["uptime *", "find *"] })
    expect(evaluate("uptime", bash(config, "plan"))).toBe("allow")
    expect(evaluate("find . -delete", bash(config, "plan"))).toBe("ask")
  })

  test("an agent's own bash rules sit between the shared allowlist and the ask flags", () => {
    const config: MutableConfig = { agent: { explore: { permission: { bash: { "*": "allow", "make *": "allow" } } } } }
    run(config)
    expect(evaluate("make test", bash(config, "explore"))).toBe("allow")
    expect(evaluate("unknown", bash(config, "explore"))).toBe("ask")
  })

  test("a fully denied bash stays denied", () => {
    const config: MutableConfig = { agent: { explore: { permission: { bash: { "*": "deny" } } } } }
    run(config)
    expect(config.agent?.explore?.permission).toMatchObject({ bash: { "*": "deny" } })
  })

  test("string permissions are normalized", () => {
    const config: MutableConfig = {
      agent: { explore: { permission: "allow" }, plan: { permission: { bash: "allow" } } },
    }
    run(config)
    expect(config.agent?.explore?.permission).toMatchObject({ "*": "allow" })
    expect(evaluate("uptime", bash(config, "plan"))).toBe("ask")
  })

  test("disabled agents are skipped", () => {
    const config: MutableConfig = { agent: { explore: { disable: true } } }
    expect(run(config).has("explore")).toBe(false)
    expect(config.agent?.explore).toEqual({ disable: true })
  })

  test("the review tools are hidden from read-only agents", () => {
    const config: MutableConfig = {}
    run(config)
    expect(config.agent?.plan?.permission).toMatchObject({ [TOOL_REVIEW]: "deny", [TOOL_UPDATE]: "deny" })
  })

  test("plan may delegate to read-only subagents only", () => {
    const config: MutableConfig = {}
    run(config)
    expect(config.agent?.plan?.permission).toMatchObject({ task: { "*": "ask", general: "deny", explore: "allow" } })
  })

  test("a confirmation prompt is always required to extend the allowlist", () => {
    const config: MutableConfig = { permission: "allow" }
    run(config)
    expect(config.permission).toEqual({ "*": "allow", [PERMISSION_CONFIRM]: "ask" })
    const other: MutableConfig = { permission: { external_directory: { "~/x/**": "allow" } } }
    run(other)
    expect(other.permission).toMatchObject({ external_directory: { "~/x/**": "allow" }, [PERMISSION_CONFIRM]: "ask" })
  })
})

const close = (config: MutableConfig, extra: Partial<Parameters<typeof failClosed>[1]> = {}) =>
  failClosed(config, { include: [], exclude: [], ...extra })

describe("failClosed", () => {
  test("read-only agents ask before every command, and keep only their own deny rules", () => {
    const config: MutableConfig = {
      agent: {
        explore: { permission: { bash: { "*": "allow", "make *": "allow", "rm *": "deny", "git push*": "ask" } } },
        reviewer: { permission: { edit: "deny" } },
        build: { permission: { bash: "allow" } },
      },
    }
    expect([...close(config)].toSorted()).toEqual(["explore", "plan", "reviewer"])
    expect(bash(config, "plan")).toEqual([["*", "ask"]])
    expect(bash(config, "reviewer")).toEqual([["*", "ask"]])
    expect(bash(config, "explore")).toEqual([
      ["*", "ask"],
      ["rm *", "deny"],
    ])
    expect(evaluate("ls -la", bash(config, "explore"))).toBe("ask")
    expect(config.agent?.build).toEqual({ permission: { bash: "allow" } })
  })

  test("a fully denied bash stays denied", () => {
    const config: MutableConfig = { agent: { explore: { permission: { bash: { "*": "deny" } } } } }
    close(config)
    expect(bash(config, "explore")).toEqual([["*", "deny"]])
  })

  test("include and exclude are honoured, disabled agents skipped", () => {
    const config: MutableConfig = { agent: { auditor: {}, explore: { disable: true } } }
    expect([...close(config, { include: ["auditor"], exclude: ["plan"] })]).toEqual(["auditor"])
    expect(config.agent?.plan).toBeUndefined()
    expect(config.agent?.explore).toEqual({ disable: true })
  })

  test("the review tools stay hidden and plan's subagents limited, as with the full policy", () => {
    const config: MutableConfig = {}
    close(config)
    expect(config.agent?.plan?.permission).toMatchObject({
      [TOOL_REVIEW]: "deny",
      [TOOL_UPDATE]: "deny",
      task: { "*": "ask", general: "deny", explore: "allow" },
    })
    expect(config.permission).toEqual({ [PERMISSION_CONFIRM]: "ask" })
  })
})
