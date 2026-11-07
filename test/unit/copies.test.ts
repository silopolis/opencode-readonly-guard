import { afterEach, describe, expect, test } from "bun:test"
import { failedCopies, registerCopy, registerFailedCopy, type CopyInfo } from "../../src/copies.js"

// The contract between installed copies of the plugin: changing it means old and new copies no longer see each other.
const KEY = Symbol.for("opencode-readonly-guard.copies.v1")
const FAILED = Symbol.for("opencode-readonly-guard.failed.v1")
const holder = globalThis as { [KEY]?: unknown; [FAILED]?: unknown }
const saved = { copies: holder[KEY], failed: holder[FAILED] }
afterEach(() => {
  holder[KEY] = saved.copies
  holder[FAILED] = saved.failed
})

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

const failure = (module: string, writeGuard = true) => ({ module, error: "cannot load allow.json", writeGuard })

describe("copies that failed to start", () => {
  test("the failed copy loaded last fails closed, as long as no copy started", () => {
    const instance = {}
    const first = registerFailedCopy(instance, failure("file:///global/dist/index.js"))
    expect(first.inCharge()).toBe(true)
    const second = registerFailedCopy(instance, failure("file:///project/dist/index.js"))
    expect([first.inCharge(), second.inCharge()]).toEqual([false, true])
    expect(failedCopies(instance).map((copy) => copy.module)).toEqual([
      "file:///global/dist/index.js",
      "file:///project/dist/index.js",
    ])
    expect(registerFailedCopy({}, failure("file:///other/dist/index.js")).inCharge()).toBe(true)
  })

  test("among failed copies, the last one that kept its write guard is preferred", () => {
    const instance = {}
    const guarded = registerFailedCopy(instance, failure("file:///global/dist/index.js"))
    const unguarded = registerFailedCopy(instance, failure("file:///project/dist/index.js", false))
    expect([guarded.inCharge(), unguarded.inCharge()]).toEqual([true, false])

    const none = {}
    registerFailedCopy(none, failure("file:///global/dist/index.js", false))
    expect(registerFailedCopy(none, failure("file:///project/dist/index.js", false)).inCharge()).toBe(true)
  })

  test("a copy that started, loaded before or after, takes over", () => {
    const after = {}
    const failedFirst = registerFailedCopy(after, failure("file:///global/dist/index.js"))
    const healthy = registerCopy(after, info("file:///project/dist/index.js"))
    expect([failedFirst.inCharge(), healthy.active()]).toEqual([false, true])

    const before = {}
    registerCopy(before, info("file:///global/dist/index.js"))
    expect(registerFailedCopy(before, failure("file:///project/dist/index.js")).inCharge()).toBe(false)
    expect(failedCopies(before)).toEqual([failure("file:///project/dist/index.js")])
  })

  test("failures are kept under their own versioned key, and copies built earlier still count as started", () => {
    const instance = {}
    // a copy built before failures were recorded: it only knows the copies key
    holder[KEY] = new WeakMap([[instance, [info("file:///old/dist/index.js")]]])
    expect(registerFailedCopy(instance, failure("file:///new/dist/index.js")).inCharge()).toBe(false)
    expect(holder[FAILED]).toBeInstanceOf(WeakMap)
    expect(failedCopies({})).toEqual([])
  })
})
