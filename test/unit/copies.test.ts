import { afterEach, describe, expect, test } from "bun:test"
import { registerCopy, type CopyInfo } from "../../src/copies.js"

// The contract between installed copies of the plugin: changing it means old and new copies no longer see each other.
const KEY = Symbol.for("opencode-readonly-guard.copies.v1")
const holder = globalThis as { [KEY]?: unknown }
const saved = holder[KEY]
afterEach(() => void (holder[KEY] = saved))

const info = (module: string, answer = module): CopyInfo => ({
  module,
  tools: {
    probe: {
      description: "probe",
      args: {},
      execute: async (_args, context) => `${answer} for ${context.agent}`,
    },
  },
})

describe("copies of the plugin", () => {
  test("the copy registered last is in charge of its instance, and of no other", () => {
    const instance = {}
    const first = registerCopy(instance, info("file:///global/dist/index.js"))
    expect(first.active()).toBe(true)
    const second = registerCopy(instance, info("file:///project/dist/index.js"))
    expect([first.active(), second.active()]).toEqual([false, true])
    expect(first.modules()).toEqual(["file:///global/dist/index.js", "file:///project/dist/index.js"])

    const other = registerCopy({}, info("file:///global/dist/index.js"))
    expect(other.active()).toBe(true)
    expect(other.modules()).toEqual(["file:///global/dist/index.js"])
    expect(second.active()).toBe(true)
  })

  test("copies find each other through a versioned key on globalThis, so separate modules can", () => {
    const instance = {}
    // what another module, holding its own copy of this code, leaves behind
    holder[KEY] = new WeakMap([[instance, [info("file:///other/dist/index.js")]]])
    const copy = registerCopy(instance, info("file:///this/dist/index.js"))
    expect(copy.modules()).toEqual(["file:///other/dist/index.js", "file:///this/dist/index.js"])
    expect(copy.active()).toBe(true)
  })

  test("an unexpected value under the key is replaced instead of breaking the plugin", () => {
    holder[KEY] = "something else"
    expect(registerCopy({}, info("file:///a/dist/index.js")).active()).toBe(true)
    expect(holder[KEY]).toBeInstanceOf(WeakMap)
  })

  test("a copy's tools run the tools of the copy in charge", async () => {
    const instance = {}
    const first = registerCopy(instance, info("file:///global/dist/index.js", "global"))
    const context = { agent: "build" } as Parameters<CopyInfo["tools"][string]["execute"]>[1]
    expect(await first.tools.probe.execute({}, context)).toBe("global for build")
    registerCopy(instance, info("file:///project/dist/index.js", "project"))
    expect(await first.tools.probe.execute({}, context)).toBe("project for build")
    expect(first.tools.probe.description).toBe("probe")
  })
})
