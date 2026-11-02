import { describe, expect, test } from "bun:test"
import type { ValidateFunction } from "ajv"
import { Ajv2020 } from "ajv/dist/2020.js"
import { readFileSync } from "node:fs"
import { classifyPattern } from "../../src/classify.js"
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

const sample = (pattern: string): string => pattern.replaceAll("*", "x")

describe("herdr rules", () => {
  const { allow, ask, commands } = loadRules()
  const { herdr } = commands
  const shipped = buildBashRules(loadRules())
  const herdrAsk = ask.filter(({ pattern }) => pattern === "herdr" || pattern.startsWith("herdr "))

  test("the opt-in UI subcommands are not in the shared allowlist, and ask.json leaves them alone", () => {
    for (const path of herdr.ui) {
      expect(allow.filter(({ pattern }) => pattern.startsWith(`herdr ${path}`))).toEqual([])
      expect(ask.filter(({ pattern }) => pattern.startsWith(`herdr ${path}`))).toEqual([])
    }
  })

  test("the UI subcommands ask until the user lists them", () => {
    for (const command of ["herdr tab rename w1:t1 plan ready", "herdr notification show done"]) {
      expect({ command, action: evaluate(command, shipped) }).toEqual({ command, action: "ask" })
    }
    const listed = buildBashRules(loadRules(), ["herdr tab rename *", "herdr notification show *"])
    for (const command of ["herdr tab rename w1:t1 plan ready", "herdr notification show done"]) {
      expect({ command, action: evaluate(command, listed) }).toEqual({ command, action: "allow" })
    }
    // listing one does not open its neighbours
    expect(evaluate("herdr tab close w1:t2", listed)).toBe("ask")
    expect(evaluate("herdr pane send-text w1:p2 hi", listed)).toBe("ask")
    // bare group help stays allowed, it prints help
    expect(evaluate("herdr notification", listed)).toBe("allow")
  })

  test("allow.json only has help and read-only herdr patterns", () => {
    const groups = herdr.help.filter((entry) => !entry.startsWith("-"))
    const derived = new Set([
      ...herdr.help.map((entry) => `herdr ${entry}`),
      ...groups.map((group) => `herdr ${group} --help`),
      ...herdr.read.map((path) => `herdr ${path} *`),
    ])
    const shippedHerdr = allow.map(({ pattern }) => pattern).filter((pattern) => pattern.startsWith("herdr"))
    expect(new Set(shippedHerdr)).toEqual(derived)
  })

  test("every mutating herdr rule asks, even when an agent allows herdr itself", () => {
    expect(herdrAsk.length).toBeGreaterThan(40)
    const permissive = buildBashRules(loadRules(), [], [["herdr *", "allow"]])
    for (const { pattern } of herdrAsk) {
      expect({ pattern, shipped: evaluate(sample(pattern), shipped) }).toEqual({ pattern, shipped: "ask" })
      expect({ pattern, permissive: evaluate(sample(pattern), permissive) }).toEqual({ pattern, permissive: "ask" })
    }
  })

  test("--trust-repository asks wherever it appears", () => {
    const permissive = buildBashRules(loadRules(), ["herdr worktree list *"])
    expect(evaluate("herdr worktree list", permissive)).toBe("allow")
    expect(evaluate("herdr worktree list --trust-repository", permissive)).toBe("ask")
  })

  test("none of them can be learned, exact or with a wildcard", () => {
    for (const { pattern } of herdrAsk) {
      const verdict = classifyPattern(sample(pattern))
      expect({ pattern, ok: verdict.ok }).toEqual({ pattern, ok: false })
    }
  })

  test("every subcommand the write guard blocks also asks, in case the guard cannot tell the agent", () => {
    for (const path of herdr.write) {
      expect(herdrAsk.map(({ pattern }) => pattern)).toContain(`herdr ${path} *`)
    }
  })

  test("a read-only herdr command is allowed with a wildcard but not after a global option", () => {
    expect(evaluate("herdr agent list", shipped)).toBe("allow")
    expect(evaluate("herdr pane read w1:p1 --lines 20", shipped)).toBe("allow")
    expect(evaluate("herdr --machine box agent list", shipped)).toBe("ask")
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
