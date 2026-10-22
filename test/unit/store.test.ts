import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { emptyStore, loadStore, saveStore } from "../../src/store.js"

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rg-store-"))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe("store", () => {
  test("a missing file is an empty store", () => {
    expect(loadStore(join(dir, "none.json"))).toEqual(emptyStore())
  })

  test("round-trips and creates parent directories", () => {
    const file = join(dir, "a", "b", "store.json")
    const data = { allow: ["whoami *"], dismissed: ["x"], agents: { include: ["review"], exclude: [] } }
    saveStore(file, data)
    expect(loadStore(file)).toEqual(data)
    expect(JSON.parse(readFileSync(file, "utf8")).$comment).toContain("readonly-guard")
  })

  test("ignores wrongly typed entries", () => {
    const file = join(dir, "store.json")
    writeFileSync(file, JSON.stringify({ allow: ["ok", 3, null], dismissed: "no", agents: { include: [1] } }))
    expect(loadStore(file)).toEqual({ allow: ["ok"], dismissed: [], agents: { include: [], exclude: [] } })
  })

  test("a corrupt file throws, or is reported when a handler is given", () => {
    const file = join(dir, "store.json")
    writeFileSync(file, "{ nope")
    expect(() => loadStore(file)).toThrow("cannot parse")
    const errors: Error[] = []
    expect(loadStore(file, (error) => errors.push(error))).toEqual(emptyStore())
    expect(errors).toHaveLength(1)
  })

  test("saving leaves no temp file behind", () => {
    const file = join(dir, "store.json")
    saveStore(file, emptyStore())
    expect(() => readFileSync(`${file}.tmp`)).toThrow()
  })
})
