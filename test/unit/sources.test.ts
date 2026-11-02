import { describe, expect, test } from "bun:test"
import { classifyPattern } from "../../src/classify.js"
import { buildBashRules, loadRules } from "../../src/rules.js"
import { effectiveRules, PRESETS, type EffectiveInput } from "../../src/sources.js"
import { emptyStore } from "../../src/store.js"
import { evaluate } from "../../src/wildcard.js"

const { commands } = loadRules()
const UI = ["herdr notification show *", "herdr tab rename *"]

const effective = (store: Partial<EffectiveInput["store"]> = {}, options: Partial<EffectiveInput["options"]> = {}) =>
  effectiveRules({
    commands,
    store: { ...emptyStore(), ...store },
    options: { allow: [], presets: {}, insideHerdr: true, ...options },
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
