import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { appendFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { clip, createLog } from "../../src/log.js"

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rg-log-"))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe("createLog", () => {
  test("appends timestamped JSON lines and reads them back in order", () => {
    const log = createLog(dir)
    log.write({ type: "call", command: "ls" })
    log.write({ type: "blocked", reason: "x" })
    const events = log.read()
    expect(events.map((event) => event.type)).toEqual(["call", "blocked"])
    expect(new Date(events[0].ts).getTime()).toBeGreaterThan(0)
  })

  test("reading a missing log gives nothing", () => {
    expect(createLog(join(dir, "none")).read()).toEqual([])
  })

  test("skips corrupt lines", () => {
    const log = createLog(dir)
    log.write({ type: "a" })
    appendFileSync(log.file, "not json\n")
    log.write({ type: "b" })
    expect(log.read().map((event) => event.type)).toEqual(["a", "b"])
  })

  test("rotates past the size limit, keeping both files readable", () => {
    const log = createLog(dir, 50)
    writeFileSync(log.file, `${JSON.stringify({ ts: "t", type: "old" })}\n`.repeat(5))
    log.write({ type: "new" })
    expect(existsSync(join(dir, "events.old.jsonl"))).toBe(true)
    expect(log.read().map((event) => event.type)).toEqual(["old", "old", "old", "old", "old", "new"])
  })

  test("never throws, even when the directory is unusable", () => {
    const blocker = join(dir, "file")
    writeFileSync(blocker, "x")
    expect(() => createLog(join(blocker, "sub")).write({ type: "call" })).not.toThrow()
  })
})

test("clip shortens long text", () => {
  expect(clip("abcdef", 3)).toBe("abc…")
  expect(clip("abc", 3)).toBe("abc")
})
