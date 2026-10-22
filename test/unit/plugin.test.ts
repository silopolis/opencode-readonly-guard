import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { MutableConfig } from "../../src/inject.js"
import plugin from "../../src/index.js"
import { createLog, type LogEvent } from "../../src/log.js"

let dir: string
let toasts: unknown[]
let sessions: Record<string, { agent?: string }>

const client = {
  session: {
    get: async ({ path }: { path: { id: string } }) => {
      if (!sessions[path.id]) throw new Error("not found")
      return { data: sessions[path.id] }
    },
  },
  tui: {
    showToast: async (arg: unknown) => {
      toasts.push(arg)
      return { data: true }
    },
  },
}

async function start(options: Record<string, unknown> = {}): Promise<{ hooks: Hooks; config: MutableConfig }> {
  const hooks = await plugin.server({ client, worktree: "/work" } as unknown as PluginInput, {
    store: join(dir, "store.json"),
    logDir: join(dir, "log"),
    ...options,
  })
  const config: MutableConfig = {}
  await hooks.config!(config as never)
  return { hooks, config }
}

const events = (): LogEvent[] => createLog(join(dir, "log")).read()
const useAgent = async (hooks: Hooks, sessionID: string, agent: string) =>
  hooks["chat.params"]!({ sessionID, agent } as never, {} as never)
const bash = async (hooks: Hooks, sessionID: string, command: string, callID = "c1") =>
  hooks["tool.execute.before"]!({ tool: "bash", sessionID, callID }, { args: { command } })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rg-plugin-"))
  toasts = []
  sessions = {}
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe("plugin module", () => {
  test("has a stable id and a server entrypoint, and nothing else is exported", async () => {
    expect(plugin.id).toBe("opencode-readonly-guard")
    expect(typeof plugin.server).toBe("function")
    const module = await import("../../src/index.js")
    expect(Object.keys(module)).toEqual(["default"])
  })
})

describe("config hook", () => {
  test("injects the policy and logs the read-only agents", async () => {
    const { config } = await start()
    expect(Object.keys(config.agent ?? {}).toSorted()).toEqual(["explore", "plan"])
    expect(events().find((event) => event.type === "init")).toMatchObject({ roAgents: ["plan", "explore"], learned: 0 })
  })

  test("applies learned rules and the allow option, and ignores unsafe ones", async () => {
    writeFileSync(join(dir, "store.json"), JSON.stringify({ allow: ["whoami *", "rm *"] }))
    const { config } = await start({ allow: ["id -un", "tee *"] })
    const permission = config.agent?.plan?.permission as { bash?: Record<string, string> } | undefined
    const rules = permission?.bash ?? {}
    expect(rules["whoami *"]).toBe("allow")
    expect(rules["id -un"]).toBe("allow")
    expect(rules["rm *"]).toBeUndefined()
    expect(rules["tee *"]).toBeUndefined()
    expect(events().filter((event) => event.type === "error")).toHaveLength(2)
  })

  test("a corrupt store does not stop the plugin", async () => {
    writeFileSync(join(dir, "store.json"), "{ nope")
    const { config } = await start()
    expect(config.agent?.plan).toBeDefined()
    expect(events().some((event) => event.type === "error")).toBe(true)
  })

  test("agents options and store agents are honoured", async () => {
    writeFileSync(join(dir, "store.json"), JSON.stringify({ agents: { exclude: ["plan"] } }))
    const { config } = await start({ agents: { exclude: ["explore"] } })
    expect(config.agent?.plan).toBeUndefined()
    expect(config.agent?.explore).toBeUndefined()
  })
})

describe("write guard", () => {
  test("blocks writes in a read-only agent and logs them", async () => {
    const { hooks } = await start()
    await useAgent(hooks, "s1", "plan")
    await expect(bash(hooks, "s1", "ls | cat > /tmp/x")).rejects.toThrow("[readonly-guard] Blocked in read-only agent")
    expect(events().find((event) => event.type === "blocked")).toMatchObject({
      agent: "plan",
      command: "ls | cat > /tmp/x",
      reason: 'write redirection "> /tmp/x"',
    })
  })

  test("lets reads through and logs them", async () => {
    const { hooks } = await start()
    await useAgent(hooks, "s1", "explore")
    await bash(hooks, "s1", "git log --oneline | head")
    expect(events().find((event) => event.type === "call")).toMatchObject({ agent: "explore", callID: "c1" })
  })

  test("does not touch write-capable agents", async () => {
    const { hooks } = await start()
    await useAgent(hooks, "s1", "build")
    await bash(hooks, "s1", "rm -rf /tmp/x > /tmp/y")
    expect(events().filter((event) => event.type === "blocked" || event.type === "call")).toEqual([])
  })

  test("ignores other tools, and bash calls without a command", async () => {
    const { hooks } = await start()
    await useAgent(hooks, "s1", "plan")
    await hooks["tool.execute.before"]!({ tool: "read", sessionID: "s1", callID: "c" }, { args: { command: "x > y" } })
    await hooks["tool.execute.before"]!({ tool: "bash", sessionID: "s1", callID: "c" }, { args: {} })
    expect(events().filter((event) => event.type === "blocked")).toEqual([])
  })

  test("the shell tool name is guarded too", async () => {
    const { hooks } = await start()
    await useAgent(hooks, "s1", "plan")
    await expect(
      hooks["tool.execute.before"]!({ tool: "shell", sessionID: "s1", callID: "c" }, { args: { command: "ls > f" } }),
    ).rejects.toThrow("Blocked")
  })

  test("utility agents never change which agent a session belongs to", async () => {
    const { hooks } = await start()
    await useAgent(hooks, "s1", "plan")
    await useAgent(hooks, "s1", "title")
    await expect(bash(hooks, "s1", "ls > f")).rejects.toThrow("Blocked")
  })

  test("switching agents in a session takes effect on the next model call", async () => {
    const { hooks } = await start()
    await useAgent(hooks, "s1", "plan")
    await expect(bash(hooks, "s1", "ls > f")).rejects.toThrow("Blocked")
    await useAgent(hooks, "s1", "build")
    await bash(hooks, "s1", "ls > f")
  })

  test("falls back to the session's agent when no model call was seen", async () => {
    const { hooks } = await start()
    sessions.s9 = { agent: "explore" }
    await expect(bash(hooks, "s9", "ls > f")).rejects.toThrow("Blocked")
    await bash(hooks, "unknown", "ls > f")
  })
})

const asked = (id: string, sessionID: string, command: string) => ({
  event: {
    type: "permission.asked",
    properties: {
      id,
      sessionID,
      permission: "bash",
      patterns: [command],
      always: [`${command.split(" ")[0]} *`],
      metadata: { command },
      tool: { callID: "c9" },
    },
  },
})
const replied = (requestID: string, sessionID: string, reply: string) => ({
  event: { type: "permission.replied", properties: { requestID, sessionID, reply } },
})

describe("permission events", () => {
  test("logs prompts and answers in read-only agents", async () => {
    const { hooks } = await start()
    await useAgent(hooks, "s1", "plan")
    await hooks.event!(asked("p1", "s1", "whoami") as never)
    await hooks.event!(replied("p1", "s1", "once") as never)
    const log = events()
    expect(log.find((event) => event.type === "asked")).toMatchObject({
      requestID: "p1",
      command: "whoami",
      callID: "c9",
    })
    expect(log.find((event) => event.type === "replied")).toMatchObject({ reply: "once", patterns: ["whoami"] })
    expect(toasts).toEqual([])
  })

  test("an 'always' answer is logged and warned about", async () => {
    const { hooks } = await start()
    await useAgent(hooks, "s1", "plan")
    await hooks.event!(asked("p1", "s1", "whoami") as never)
    await hooks.event!(replied("p1", "s1", "always") as never)
    expect(toasts).toHaveLength(1)
    expect(JSON.stringify(toasts[0])).toContain('allows \\"whoami *\\" in ALL agents')
  })

  test("the warning can be turned off", async () => {
    const { hooks } = await start({ toast: false })
    await useAgent(hooks, "s1", "plan")
    await hooks.event!(asked("p1", "s1", "whoami") as never)
    await hooks.event!(replied("p1", "s1", "always") as never)
    expect(toasts).toEqual([])
    expect(events().find((event) => event.type === "replied")).toMatchObject({ reply: "always" })
  })

  test("prompts of write-capable agents are not recorded", async () => {
    const { hooks } = await start()
    await useAgent(hooks, "s1", "build")
    await hooks.event!(asked("p1", "s1", "whoami") as never)
    await hooks.event!(replied("p1", "s1", "once") as never)
    expect(events().filter((event) => event.type === "asked" || event.type === "replied")).toEqual([])
  })

  test("deleting a session forgets its agent", async () => {
    const { hooks } = await start()
    await useAgent(hooks, "s1", "plan")
    await hooks.event!({ event: { type: "session.deleted", properties: { info: { id: "s1" } } } } as never)
    await bash(hooks, "s1", "ls > f") // unknown session again: not guarded
  })

  test("unrelated events and unknown answers are ignored", async () => {
    const { hooks } = await start()
    await hooks.event!({ event: { type: "session.idle", properties: {} } } as never)
    await hooks.event!(replied("never-asked", "s1", "once") as never)
    expect(events().filter((event) => event.type === "replied")).toEqual([])
  })
})
