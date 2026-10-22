import { describe, expect, test } from "bun:test"
import { Ajv2020 } from "ajv/dist/2020.js"
import { readFileSync } from "node:fs"
import { classifyPattern } from "../../src/classify.js"
import { decide } from "../../src/decide.js"
import { buildBashRules, loadRules } from "../../src/rules.js"

interface Case {
  command: string
  verdict: "allow" | "ask" | "block"
  reason?: string
}

const read = (file: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../rules/${file}`, import.meta.url), "utf8"))
interface PatternCase {
  pattern: string
  ok: boolean
  reason?: string
}

const file = read("cases.json") as { commands: Case[]; patterns: PatternCase[] }
const bash = buildBashRules(loadRules())

test("cases.json matches its schema", () => {
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(read("schema/cases.schema.json") as object)
  expect(validate(file)).toBe(true)
  expect(validate.errors ?? []).toEqual([])
})

test("cases are unique", () => {
  const commands = file.commands.map((entry) => entry.command)
  expect(new Set(commands).size).toBe(commands.length)
})

test("every verdict is covered", () => {
  for (const verdict of ["allow", "ask", "block"])
    expect(file.commands.some((entry) => entry.verdict === verdict)).toBe(true)
})

describe("expected verdicts (rules/cases.json)", () => {
  test.each(file.commands.map((entry) => [entry.command.replaceAll("\n", "⏎"), entry] as const))(
    "%s",
    (_name, entry) => {
      const decision = decide(entry.command, bash)
      expect(decision.verdict).toBe(entry.verdict)
      if (entry.verdict === "block" && entry.reason && decision.verdict === "block") {
        expect(decision.reason).toContain(entry.reason)
      }
    },
  )
})

describe("pattern vetting (rules/cases.json)", () => {
  test.each(file.patterns.map((entry) => [JSON.stringify(entry.pattern), entry] as const))("%s", (_name, entry) => {
    const verdict = classifyPattern(entry.pattern)
    expect(verdict.ok).toBe(entry.ok)
    if (!entry.ok && entry.reason) expect(verdict.reason).toContain(entry.reason)
  })
})
