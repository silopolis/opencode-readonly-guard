import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { classifyPattern } from "../../src/classify.js"
import { buildBashRules, loadRules } from "../../src/rules.js"
import { effectiveRules, loadHerdrRules, PRESETS, type EffectiveInput } from "../../src/sources.js"
import { emptyStore } from "../../src/store.js"
import { evaluate } from "../../src/wildcard.js"

const { commands } = loadRules()
const UI = ["herdr notification show *", "herdr tab rename *"]

const effective = (
  store: Partial<EffectiveInput["store"]> = {},
  options: Partial<EffectiveInput["options"]> = {},
  herdr?: EffectiveInput["herdr"],
) =>
  effectiveRules({
    commands,
    store: { ...emptyStore(), ...store },
    options: { allow: [], presets: {}, insideHerdr: true, ...options },
    herdr,
  })
const action = (command: string, patterns: readonly string[]) =>
  evaluate(command, buildBashRules(loadRules(), patterns))

describe("the herdr-ui preset", () => {
  test("is on by default inside herdr, and is not counted as learned", () => {
    const result = effective()
    expect(result.presets).toEqual(["herdr-ui"])
    expect(result.patterns).toEqual(UI)
    expect(result.learned).toEqual([])
    expect(result.problems).toEqual([])
  })

  test("does nothing outside herdr, even when switched on", () => {
    expect(effective({}, { insideHerdr: false })).toMatchObject({ presets: [], patterns: [], learned: [] })
    expect(effective({ presets: { "herdr-ui": true } }, { insideHerdr: false }).presets).toEqual([])
  })

  test("allows exactly the UI commands and nothing next to them", () => {
    const { patterns } = effective()
    expect(action("herdr tab rename w1:t1 plan ready", patterns)).toBe("allow")
    expect(action("herdr notification show done", patterns)).toBe("allow")
    for (const command of [
      "herdr tab close w1:t1",
      "herdr tab create",
      "herdr agent prompt reviewer hi",
      "herdr pane send-text w1:p2 hi",
      "herdr --machine box tab rename w1:t1 x",
    ]) {
      expect({ command, action: action(command, patterns) }).toEqual({ command, action: "ask" })
    }
    // and without the preset they ask
    expect(action("herdr tab rename w1:t1 plan ready", [])).toBe("ask")
  })

  test("every preset pattern passes the safety check", () => {
    for (const preset of PRESETS) {
      for (const pattern of preset.patterns(commands)) {
        expect({ pattern, ok: classifyPattern(pattern, commands).ok }).toEqual({ pattern, ok: true })
      }
    }
  })

  test("preset names are unique", () => {
    const ids = PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("switching presets", () => {
  test("the plugin options can switch it off", () => {
    expect(effective({}, { presets: { "herdr-ui": false } })).toMatchObject({ presets: [], patterns: [] })
  })

  test("the store can switch it off", () => {
    expect(effective({ presets: { "herdr-ui": false } })).toMatchObject({ presets: [], patterns: [] })
  })

  test("when they disagree the store wins", () => {
    expect(effective({ presets: { "herdr-ui": true } }, { presets: { "herdr-ui": false } }).presets).toEqual([
      "herdr-ui",
    ])
    expect(effective({ presets: { "herdr-ui": false } }, { presets: { "herdr-ui": true } }).presets).toEqual([])
  })

  test("switched off, one UI command can still be listed on its own", () => {
    const result = effective({ presets: { "herdr-ui": false }, allow: ["herdr tab rename *"] })
    expect(result.presets).toEqual([])
    expect(result.patterns).toEqual(["herdr tab rename *"])
    expect(action("herdr tab rename w1:t1 x", result.patterns)).toBe("allow")
    expect(action("herdr notification show x", result.patterns)).toBe("ask")
  })

  test("an unknown preset is reported and ignored", () => {
    const result = effective({ presets: { "no-such": true } }, { presets: { other: false } })
    expect(result.presets).toEqual(["herdr-ui"])
    expect(result.problems).toEqual([
      { where: "presets", error: 'unknown preset "other" ignored' },
      { where: "presets", error: 'unknown preset "no-such" ignored' },
    ])
  })
})

describe("herdr's rules file", () => {
  let dir: string
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "rg-herdr-"))))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const file = () => join(dir, "readonly-guard.json")
  const load = (insideHerdr = true, onError?: (error: Error) => void) =>
    loadHerdrRules({ insideHerdr, herdrFile: file() }, onError)

  test("a missing file is no file", () => {
    expect(load()).toEqual({ allow: [], presets: {} })
  })

  test("is read inside herdr only", () => {
    writeFileSync(file(), JSON.stringify({ allow: ["herdr tab rename *"], presets: { "herdr-ui": false } }))
    expect(load(true)).toEqual({ allow: ["herdr tab rename *"], presets: { "herdr-ui": false } })
    expect(load(false)).toEqual({ allow: [], presets: {} })
  })

  test("ignores wrongly typed entries and keys it does not know", () => {
    writeFileSync(file(), JSON.stringify({ allow: ["herdr x", 3], presets: { a: true, b: "no" }, dismissed: ["z"] }))
    expect(load()).toEqual({ allow: ["herdr x"], presets: { a: true } })
    writeFileSync(file(), JSON.stringify({ allow: "herdr x", presets: [true] }))
    expect(load()).toEqual({ allow: [], presets: {} })
  })

  test("a corrupt file is reported and ignored", () => {
    writeFileSync(file(), "{ nope")
    const errors: Error[] = []
    expect(load(true, (error) => errors.push(error))).toEqual({ allow: [], presets: {} })
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("cannot parse")
    expect(() => load()).not.toThrow()
  })

  test("its preset switch wins over the store and the plugin options", () => {
    const off = { allow: [], presets: { "herdr-ui": false } }
    expect(effective({ presets: { "herdr-ui": true } }, { presets: { "herdr-ui": true } }, off).presets).toEqual([])
    const on = { allow: [], presets: { "herdr-ui": true } }
    expect(effective({ presets: { "herdr-ui": false } }, { presets: { "herdr-ui": false } }, on).presets).toEqual([
      "herdr-ui",
    ])
  })

  test("its patterns add to the others and pass the same safety check", () => {
    const herdr = {
      allow: ["herdr agent list *", "herdr pane send-text *", "herdr agent prompt reviewer hi"],
      presets: {},
    }
    const result = effective({ allow: ["whoami *"] }, {}, herdr)
    expect(result.learned).toEqual(["whoami *", "herdr agent list *"])
    expect(result.problems.map(({ where, pattern }) => [where, pattern])).toEqual([
      ["herdr config", "herdr pane send-text *"],
      ["herdr config", "herdr agent prompt reviewer hi"],
    ])
  })

  test("only herdr patterns belong in it", () => {
    const result = effective({}, {}, { allow: ["whoami *", "git log *", "rtk herdr tab rename *"], presets: {} })
    expect(result.learned).toEqual([])
    expect(result.problems).toEqual(
      ["whoami *", "git log *", "rtk herdr tab rename *"].map((pattern) => ({
        where: "herdr config",
        pattern,
        error: "ignored rule: only herdr commands belong in this file",
      })),
    )
  })

  test("listing one UI command there, with the preset off, allows only that one", () => {
    const result = effective({}, {}, { allow: ["herdr notification show *"], presets: { "herdr-ui": false } })
    expect(result.presets).toEqual([])
    expect(action("herdr notification show x", result.patterns)).toBe("allow")
    expect(action("herdr tab rename w1:t1 x", result.patterns)).toBe("ask")
  })

  test("is ignored outside herdr, even if it was passed in", () => {
    const herdr = { allow: ["herdr agent list *"], presets: { "herdr-ui": false } }
    expect(effective({}, { insideHerdr: false }, herdr)).toMatchObject({ learned: [], presets: [], problems: [] })
  })

  test("unknown presets in it are reported with its name", () => {
    expect(effective({}, {}, { allow: [], presets: { nope: true } }).problems).toEqual([
      { where: "herdr config", error: 'unknown preset "nope" ignored' },
    ])
  })
})

describe("user patterns", () => {
  test("come from the store and the options, are vetted, and the refusals are reported", () => {
    const result = effective({ allow: ["whoami *", "rm *"] }, { allow: ["id -un", "herdr agent prompt *"] })
    expect(result.learned).toEqual(["whoami *", "id -un"])
    expect(result.patterns).toEqual([...UI, "whoami *", "id -un"])
    expect(result.problems.map(({ where, pattern }) => [where, pattern])).toEqual([
      ["store", "rm *"],
      ["options", "herdr agent prompt *"],
    ])
  })

  test("herdr UI patterns listed by the user only apply inside herdr", () => {
    const store = { allow: ["herdr tab rename *", "rtk herdr notification show *", "herdr agent list *", "whoami *"] }
    expect(effective(store, { insideHerdr: false }).learned).toEqual(["herdr agent list *", "whoami *"])
    expect(effective(store, { insideHerdr: true }).learned).toEqual(store.allow)
  })

  test("a UI pattern outside herdr is dropped without a complaint", () => {
    const result = effective({ allow: ["herdr tab rename *"] }, { insideHerdr: false })
    expect(result.problems).toEqual([])
  })
})
