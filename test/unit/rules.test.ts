import { describe, expect, test } from "bun:test"
import type { ValidateFunction } from "ajv"
import { Ajv2020 } from "ajv/dist/2020.js"
import { readFileSync } from "node:fs"
import { buildBashRules, loadRules } from "../../src/rules.js"
import { evaluate } from "../../src/wildcard.js"

const read = (file: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../rules/${file}`, import.meta.url), "utf8"))
const ajv = new Ajv2020({ strict: true, allErrors: true })
const validators = new Map<string, ValidateFunction>()
const validatorFor = (schema: string): ValidateFunction => {
  let validate = validators.get(schema)
  if (!validate) {
    validate = ajv.compile(read(schema) as object)
    validators.set(schema, validate)
  }
  return validate
}

describe("shared rule files", () => {
  test.each([
    ["allow.json", "schema/patterns.schema.json"],
    ["ask.json", "schema/patterns.schema.json"],
    ["commands.json", "schema/commands.schema.json"],
  ])("%s matches %s", (file, schema) => {
    const validate = validatorFor(schema)
    const ok = validate(read(file))
    expect(validate.errors ?? []).toEqual([])
    expect(ok).toBe(true)
  })

  test("patterns are unique within each file", () => {
    const { allow, ask } = loadRules()
    for (const list of [allow, ask]) {
      const patterns = list.map((rule) => rule.pattern)
      expect(new Set(patterns).size).toBe(patterns.length)
    }
  })

  test("allow patterns start with a literal command", () => {
    for (const { pattern } of loadRules().allow) expect(pattern).toMatch(/^[a-z]/)
  })

  test("every allow pattern is really allowed once the ask rules are applied", () => {
    const bash = buildBashRules(loadRules())
    for (const { pattern } of loadRules().allow) {
      const sample = pattern.replace(/ \*$/, " x").replace(/\*$/, "x")
      expect({ sample, action: evaluate(sample, bash) }).toEqual({ sample, action: "allow" })
    }
  })

  test("the schema rejects shell operators in patterns", () => {
    const validate = validatorFor("schema/patterns.schema.json")
    expect(validate({ version: 1, rules: [{ pattern: "cat * > x", reason: "nope" }] })).toBe(false)
  })
})

describe("buildBashRules", () => {
  const rules = loadRules()

  test("asks by default, first", () => {
    expect(buildBashRules(rules)[0]).toEqual(["*", "ask"])
  })

  test("ask flags come last so they override allow and learned rules", () => {
    const bash = buildBashRules(rules, ["find *"])
    const lastAllow = bash.findLastIndex(([, action]) => action === "allow")
    const firstAsk = bash.findIndex(([pattern]) => rules.ask.some((rule) => rule.pattern === pattern))
    expect(firstAsk).toBeGreaterThan(lastAllow)
    expect(evaluate("find . -delete", bash)).toBe("ask")
  })

  test("learned rules allow more", () => {
    expect(evaluate("whoami", buildBashRules(rules))).toBe("ask")
    expect(evaluate("whoami", buildBashRules(rules, ["whoami *"]))).toBe("allow")
  })

  test("an agent's own rule is moved after the shared ones", () => {
    const bash = buildBashRules(rules, [], [["ls *", "ask"]])
    expect(evaluate("ls -la", bash)).toBe("ask")
  })

  test("re-adding a pattern does not duplicate it", () => {
    const bash = buildBashRules(rules, ["ls *", "ls *"])
    expect(bash.filter(([pattern]) => pattern === "ls *")).toHaveLength(1)
  })
})
