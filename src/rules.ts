import { readFileSync } from "node:fs"
import type { Action, RuleEntry } from "./wildcard.js"

export interface PatternRule {
  pattern: string
  reason: string
}

export interface Commands {
  hardWrite: string[]
  packageManagers: { names: string[]; writeSubcommands: string[] }
  git: { write: string[]; read: string[] }
  wildcardSafe: string[]
  rtkReadSubcommands: string[]
}

export interface RuleSet {
  allow: PatternRule[]
  ask: PatternRule[]
  commands: Commands
}

const RULES_DIR = new URL("../rules/", import.meta.url)

function readJson(file: string): unknown {
  const url = new URL(file, RULES_DIR)
  try {
    return JSON.parse(readFileSync(url, "utf8"))
  } catch (error) {
    throw new Error(`readonly-guard: cannot load ${file}`, { cause: error })
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function stringList(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`readonly-guard: ${where} must be a list of strings`)
  }
  return value as string[]
}

function patternRules(raw: unknown, file: string): PatternRule[] {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.rules)) {
    throw new Error(`readonly-guard: ${file} must be { "version": 1, "rules": [...] }`)
  }
  return raw.rules.map((rule, index) => {
    if (!isRecord(rule) || typeof rule.pattern !== "string" || typeof rule.reason !== "string" || !rule.pattern) {
      throw new Error(`readonly-guard: ${file} rules[${index}] needs a "pattern" and a "reason"`)
    }
    return { pattern: rule.pattern, reason: rule.reason }
  })
}

function commands(raw: unknown): Commands {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.packageManagers) || !isRecord(raw.git)) {
    throw new Error("readonly-guard: commands.json has an unexpected shape")
  }
  return {
    hardWrite: stringList(raw.hardWrite, "commands.json hardWrite"),
    packageManagers: {
      names: stringList(raw.packageManagers.names, "commands.json packageManagers.names"),
      writeSubcommands: stringList(
        raw.packageManagers.writeSubcommands,
        "commands.json packageManagers.writeSubcommands",
      ),
    },
    git: {
      write: stringList(raw.git.write, "commands.json git.write"),
      read: stringList(raw.git.read, "commands.json git.read"),
    },
    wildcardSafe: stringList(raw.wildcardSafe, "commands.json wildcardSafe"),
    rtkReadSubcommands: stringList(raw.rtkReadSubcommands, "commands.json rtkReadSubcommands"),
  }
}

let cached: RuleSet | undefined

/** Load the shared rule files shipped with the package (`rules/*.json`). */
export function loadRules(): RuleSet {
  cached ??= {
    allow: patternRules(readJson("allow.json"), "allow.json"),
    ask: patternRules(readJson("ask.json"), "ask.json"),
    commands: commands(readJson("commands.json")),
  }
  return cached
}

/**
 * Ordered bash rules for a read-only agent. Later rules win, so the order is:
 * ask by default, shared allowlist, learned rules, the agent's own rules, then the always-ask flags.
 * Re-adding a pattern moves it to its new position instead of keeping the old one.
 */
export function buildBashRules(
  rules: RuleSet,
  learned: readonly string[] = [],
  own: readonly RuleEntry[] = [],
): RuleEntry[] {
  const merged = new Map<string, Action>()
  const put = (pattern: string, action: Action) => {
    merged.delete(pattern)
    merged.set(pattern, action)
  }
  put("*", "ask")
  for (const { pattern } of rules.allow) put(pattern, "allow")
  for (const pattern of learned) put(pattern, "allow")
  for (const [pattern, action] of own) put(pattern, action)
  for (const { pattern } of rules.ask) put(pattern, "ask")
  return [...merged]
}
