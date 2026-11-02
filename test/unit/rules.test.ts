import { describe, expect, test } from "bun:test"
import type { ValidateFunction } from "ajv"
import { Ajv2020 } from "ajv/dist/2020.js"
import { readFileSync } from "node:fs"
import { classifyPattern } from "../../src/classify.js"
import { decide } from "../../src/decide.js"
import { buildBashRules, helpPatterns, loadRules } from "../../src/rules.js"
import { evaluate, wildcardMatch } from "../../src/wildcard.js"

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

describe("the help layer", () => {
  const rules = loadRules()
  const bash = buildBashRules(rules)
  const help = helpPatterns(rules)
  /** ask.json patterns about an option (`*-delete*`, `herdr --machine *`), not a subcommand (`herdr pane close *`). */
  const flags = rules.ask.map(({ pattern }) => pattern).filter((pattern) => /(^|[ *])-/.test(pattern))

  test("allows the help of blocked and ask-listed subcommands", () => {
    for (const command of [
      "git commit --help",
      "rtk git push --help",
      "git config --help",
      "herdr worktree create --help",
      "herdr agent prompt --help",
      "herdr server --help",
      "npm install --help",
      "rtk npm run --help",
      "mise use --help",
      "mise settings set --help",
      "rtk mise run --help",
    ]) {
      expect({ command, decision: decide(command, bash) }).toEqual({ command, decision: { verdict: "allow" } })
    }
  })

  test("every derived command is allowed", () => {
    expect(help.length).toBeGreaterThan(100)
    for (const command of help) {
      expect({ command, decision: decide(command, bash) }).toEqual({ command, decision: { verdict: "allow" } })
    }
  })

  test("holds exact `<subcommand> --help` commands only", () => {
    for (const pattern of help) {
      expect({ pattern, exact: !/[*?]/.test(pattern) && pattern.endsWith(" --help") }).toEqual({ pattern, exact: true })
    }
  })

  test("never shadows an ask-listed flag", () => {
    expect(flags).toContain("*-delete*")
    expect(flags).toContain("herdr --machine *")
    expect(flags).not.toContain("herdr pane close *")
    for (const pattern of help) {
      expect({ pattern, flags: flags.filter((flag) => wildcardMatch(pattern, flag)) }).toEqual({ pattern, flags: [] })
    }
  })

  test("anything next to --help is judged as usual", () => {
    for (const [command, verdict] of [
      ["herdr worktree create --branch x", "block"],
      ["herdr worktree create --branch x --help", "block"],
      ["herdr agent prompt reviewer --help", "ask"],
      ["git commit -m x --help", "block"],
      ["git commit -h", "block"],
      ["npm install left-pad --help", "block"],
      ["mise use node --help", "ask"],
    ] as const) {
      expect({ command, verdict: decide(command, bash).verdict }).toEqual({ command, verdict })
    }
  })

  test("leaves the herdr UI subcommands alone: outside herdr nothing about them is allowed", () => {
    for (const path of rules.commands.herdr.ui) {
      expect(help.filter((pattern) => pattern.startsWith(`herdr ${path}`))).toEqual([])
      expect(evaluate(`herdr ${path} --help`, bash)).toBe("ask")
    }
  })

  test("skips what the rules before it already allow", () => {
    expect(help).not.toContain("git log --help")
    expect(help).not.toContain("herdr agent list --help")
    expect(evaluate("git log --help", bash)).toBe("allow")
  })
})

describe("buildBashRules", () => {
  const rules = loadRules()

  test("asks by default, first", () => {
    expect(buildBashRules(rules)[0]).toEqual(["*", "ask"])
  })

  test("ask flags come after allow and learned rules, so they override them; only exact help follows", () => {
    const bash = buildBashRules(rules, ["find *"])
    const help = new Set(helpPatterns(rules))
    const lastAllow = bash.findLastIndex(([pattern, action]) => action === "allow" && !help.has(pattern))
    const firstAsk = bash.findIndex(([pattern]) => rules.ask.some((rule) => rule.pattern === pattern))
    const lastAsk = bash.findLastIndex(([pattern]) => rules.ask.some((rule) => rule.pattern === pattern))
    expect(firstAsk).toBeGreaterThan(lastAllow)
    expect(bash.slice(lastAsk + 1).every(([pattern, action]) => action === "allow" && help.has(pattern))).toBe(true)
    expect(evaluate("find . -delete", bash)).toBe("ask")
  })

  test("learned rules allow more", () => {
    expect(evaluate("uptime", buildBashRules(rules))).toBe("ask")
    expect(evaluate("uptime", buildBashRules(rules, ["uptime *"]))).toBe("allow")
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
