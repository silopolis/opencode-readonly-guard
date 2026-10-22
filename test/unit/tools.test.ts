import type { Hooks } from "@opencode-ai/plugin"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PERMISSION_CONFIRM, TOOL_REVIEW, TOOL_UPDATE } from "../../src/constants.js"
import { createLog } from "../../src/log.js"
import { loadRules } from "../../src/rules.js"
import { emptyStore, loadStore, saveStore } from "../../src/store.js"
import { createTools } from "../../src/tools.js"

let dir: string
let storeFile: string
let asked: { permission: string; patterns: string[]; always: string[]; metadata: Record<string, unknown> }[]
let tools: NonNullable<Hooks["tool"]>

const context = (agent: string, reject = false) =>
  ({
    agent,
    ask: async (request: (typeof asked)[number]) => {
      asked.push(request)
      if (reject) throw new Error("The user rejected permission to use this specific tool call.")
    },
  }) as never
const update = (args: { action: "allow" | "remove" | "dismiss"; value: string }, agent = "build", reject = false) =>
  tools[TOOL_UPDATE].execute(args as never, context(agent, reject))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rg-tools-"))
  storeFile = join(dir, "store.json")
  asked = []
  tools = createTools({
    readOnly: new Set(["plan", "explore"]),
    rules: loadRules(),
    log: createLog(join(dir, "log")),
    storeFile,
    project: "/work",
  })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe("readonly_guard_review", () => {
  test("returns the report", async () => {
    const result = await tools[TOOL_REVIEW].execute({} as never, context("build"))
    expect(String(result)).toContain("## readonly-guard review")
  })

  test("is not available to read-only agents", async () => {
    await expect(tools[TOOL_REVIEW].execute({} as never, context("plan"))).rejects.toThrow("not available")
  })
})

describe("readonly_guard_update", () => {
  test("allow asks for confirmation of the exact pattern, then saves it", async () => {
    const result = await update({ action: "allow", value: "  whoami   * " })
    expect(String(result)).toContain('Added "whoami *"')
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ permission: PERMISSION_CONFIRM, patterns: ["whoami *"], always: [] })
    expect(loadStore(storeFile).allow).toEqual(["whoami *"])
  })

  test("a rejected confirmation changes nothing", async () => {
    await expect(update({ action: "allow", value: "whoami *" }, "build", true)).rejects.toThrow("rejected")
    expect(loadStore(storeFile).allow).toEqual([])
  })

  test("unsafe patterns are refused before any prompt", async () => {
    await expect(update({ action: "allow", value: "rm *" })).rejects.toThrow('Refused "rm *"')
    await expect(update({ action: "allow", value: "tee *" })).rejects.toThrow("Refused")
    expect(asked).toEqual([])
    expect(loadStore(storeFile).allow).toEqual([])
  })

  test("adding a pattern twice is a no-op", async () => {
    await update({ action: "allow", value: "whoami *" })
    expect(String(await update({ action: "allow", value: "whoami *" }))).toContain("already in the allowlist")
    expect(asked).toHaveLength(1)
  })

  test("allowing a dismissed pattern un-dismisses it", async () => {
    saveStore(storeFile, { ...emptyStore(), dismissed: ["whoami *", "other"] })
    await update({ action: "allow", value: "whoami *" })
    expect(loadStore(storeFile).dismissed).toEqual(["other"])
  })

  test("remove deletes a learned pattern", async () => {
    saveStore(storeFile, { ...emptyStore(), allow: ["whoami *", "id -un"] })
    expect(String(await update({ action: "remove", value: "whoami *" }))).toContain("Removed")
    expect(loadStore(storeFile).allow).toEqual(["id -un"])
    expect(String(await update({ action: "remove", value: "nope" }))).toContain("not in the allowlist")
  })

  test("dismiss is idempotent", async () => {
    await update({ action: "dismiss", value: "id -un" })
    await update({ action: "dismiss", value: "id -un" })
    expect(loadStore(storeFile).dismissed).toEqual(["id -un"])
    expect(asked).toEqual([])
  })

  test("is not available to read-only agents", async () => {
    await expect(update({ action: "allow", value: "whoami *" }, "explore")).rejects.toThrow("not available")
    expect(loadStore(storeFile).allow).toEqual([])
  })

  test("records what was learned in the event log", async () => {
    await update({ action: "allow", value: "whoami *" })
    const events = createLog(join(dir, "log")).read()
    expect(events.find((event) => event.type === "learned")).toMatchObject({ pattern: "whoami *", agent: "build" })
  })
})
