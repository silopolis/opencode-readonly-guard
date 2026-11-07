import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import type { RuleFile } from "../../src/embed.js"
import { BUILTIN_RULES, loadRules, readCommands, readRuleSet, type RuleSources } from "../../src/rules.js"

const onDisk = (file: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../rules/${file}`, import.meta.url), "utf8"))

const unreadable = (file: string) =>
  new Error(`readonly-guard: cannot load ${file}`, { cause: new SyntaxError("JSON Parse error: Unexpected EOF") })

/** The rule files on disk, with some replaced: an Error is thrown, anything else is read instead of the file. */
const sources = (
  replaced: Partial<Record<RuleFile, unknown>>,
  builtin: RuleSources["builtin"] = BUILTIN_RULES,
): RuleSources => ({
  read: (file) => {
    if (!(file in replaced)) return onDisk(file)
    const value = replaced[file]
    if (value instanceof Error) throw value
    return value
  },
  builtin,
})

describe("the copy of the rule files built into the plugin", () => {
  test("is the rule files as they are", () => {
    expect(Object.keys(BUILTIN_RULES).toSorted()).toEqual(["allow.json", "ask.json", "commands.json"])
    for (const [file, text] of Object.entries(BUILTIN_RULES)) expect(JSON.parse(text)).toEqual(onDisk(file))
  })

  test("replaces a file that cannot be read, which is reported", () => {
    const rules = readRuleSet(sources({ "allow.json": unreadable("allow.json") }))
    expect(rules.allow).toEqual(loadRules().allow)
    expect(rules.fallbacks).toEqual([
      { file: "allow.json", error: "readonly-guard: cannot load allow.json: JSON Parse error: Unexpected EOF" },
    ])
  })

  test("replaces a file of the wrong shape", () => {
    const rules = readRuleSet(sources({ "ask.json": { version: 2 }, "commands.json": { version: 1 } }))
    expect(rules.ask).toEqual(loadRules().ask)
    expect(rules.commands).toEqual(loadRules().commands)
    expect(rules.fallbacks).toEqual([
      { file: "ask.json", error: 'readonly-guard: ask.json must be { "version": 1, "rules": [...] }' },
      { file: "commands.json", error: "readonly-guard: commands.json has an unexpected shape" },
    ])
  })

  test("is not used for the files that can be read: editing a checkout's rules needs no build", () => {
    const edited = { version: 1, rules: [{ pattern: "uptime", reason: "edited" }] }
    const rules = readRuleSet(sources({ "allow.json": edited }))
    expect(rules.allow).toEqual([{ pattern: "uptime", reason: "edited" }])
    expect(rules.fallbacks).toEqual([])
    expect(loadRules().fallbacks).toEqual([])
  })

  test("the write guard's file alone falls back the same way", () => {
    const { commands, fallbacks } = readCommands(sources({ "commands.json": unreadable("commands.json") }))
    expect(commands).toEqual(loadRules().commands)
    expect(fallbacks).toMatchObject([{ file: "commands.json" }])
  })

  test("without a copy, a file that cannot be read is an error", () => {
    expect(() => readRuleSet(sources({ "allow.json": unreadable("allow.json") }, {}))).toThrow(
      "readonly-guard: cannot load allow.json",
    )
    expect(() => readCommands(sources({ "commands.json": { version: 1 } }, {}))).toThrow("unexpected shape")
  })
})
