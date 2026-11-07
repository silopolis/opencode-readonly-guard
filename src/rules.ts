import { readFileSync } from "node:fs"
import { evaluate, type Action, type RuleEntry } from "./wildcard.js"

export interface PatternRule {
  pattern: string
  reason: string
}

export interface Commands {
  hardWrite: string[]
  packageManagers: { names: string[]; writeSubcommands: string[] }
  git: { write: string[]; read: string[] }
  herdr: { help: string[]; read: string[]; ui: string[]; write: string[] }
  /** Variables that may be exported to later commands, and those treated as always exported (see environment.ts). */
  environment: { exportSafe: string[]; alwaysExported: string[] }
  /** docker and podman: read-only and writing subcommand paths. */
  containers: { names: string[]; read: string[]; write: string[] }
  /** Subcommands whose exact `<program> <subcommand> --help` is allowed after the ask flags (see `helpCommands`). */
  subcommandHelp: { git: string[]; npm: string[]; mise: string[] }
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
  if (
    !isRecord(raw) ||
    raw.version !== 1 ||
    !isRecord(raw.packageManagers) ||
    !isRecord(raw.git) ||
    !isRecord(raw.herdr) ||
    !isRecord(raw.containers) ||
    !isRecord(raw.environment) ||
    !isRecord(raw.subcommandHelp)
  ) {
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
    herdr: {
      help: stringList(raw.herdr.help, "commands.json herdr.help"),
      read: stringList(raw.herdr.read, "commands.json herdr.read"),
      ui: stringList(raw.herdr.ui, "commands.json herdr.ui"),
      write: stringList(raw.herdr.write, "commands.json herdr.write"),
    },
    environment: {
      exportSafe: stringList(raw.environment.exportSafe, "commands.json environment.exportSafe"),
      alwaysExported: stringList(raw.environment.alwaysExported, "commands.json environment.alwaysExported"),
    },
    containers: {
      names: stringList(raw.containers.names, "commands.json containers.names"),
      read: stringList(raw.containers.read, "commands.json containers.read"),
      write: stringList(raw.containers.write, "commands.json containers.write"),
    },
    subcommandHelp: {
      git: stringList(raw.subcommandHelp.git, "commands.json subcommandHelp.git"),
      npm: stringList(raw.subcommandHelp.npm, "commands.json subcommandHelp.npm"),
      mise: stringList(raw.subcommandHelp.mise, "commands.json subcommandHelp.mise"),
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

/** A herdr subcommand path in an ask rule: `herdr agent prompt *` → `agent prompt`, `herdr server` → `server`. */
const HERDR_ASK_PATH = /^herdr ([a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*){0,2})(?: \*)?$/

/**
 * Every exact `<program> <subcommand> --help` the help layer may allow: git's subcommands (`git.write`, `git.read`
 * and `subcommandHelp.git`), herdr's paths (`herdr.read`, `herdr.write` and its `herdr <path> *` ask rules), npm's and
 * mise's `subcommandHelp` lists, and the `rtk …` form of the git, npm and mise ones; plus `git help <subcommand>`,
 * which `git <subcommand> --help` runs (rtk does not rewrite it). The write guard does not block them (a sole
 * trailing `--help` only prints help).
 */
export function helpCommands(rules: Pick<RuleSet, "commands" | "ask">): string[] {
  const { git, herdr, subcommandHelp } = rules.commands
  const { ask } = rules
  const askPaths = ask.flatMap(({ pattern }) => HERDR_ASK_PATH.exec(pattern)?.[1] ?? [])
  const gitSubcommands = [...git.write, ...git.read, ...subcommandHelp.git]
  const rewrittenByRtk = [
    ...gitSubcommands.map((sub) => `git ${sub}`),
    ...subcommandHelp.npm.map((sub) => `npm ${sub}`),
    ...subcommandHelp.mise.map((path) => `mise ${path}`),
  ]
  // not the UI subcommands: outside herdr nothing about them may be allowed (see the herdr-ui preset)
  const herdrPaths = [...herdr.read, ...herdr.write, ...askPaths].map((path) => `herdr ${path}`)
  const all = [...rewrittenByRtk, ...rewrittenByRtk.map((command) => `rtk ${command}`), ...herdrPaths]
  return [...new Set([...all.map((command) => `${command} --help`), ...gitSubcommands.map((sub) => `git help ${sub}`)])]
}

/**
 * The help layer: the `helpCommands` that the rules before it would ask about. It only turns a prompt into an
 * allow; it never overrides an explicit deny or an exact rule of the agent's own.
 */
export function helpPatterns(rules: RuleSet, before: readonly RuleEntry[] = baseRules(rules)): string[] {
  const listed = new Set(before.map(([pattern]) => pattern))
  return helpCommands(rules).filter((command) => !listed.has(command) && evaluate(command, before) === "ask")
}

function baseRules(rules: RuleSet, learned: readonly string[] = [], own: readonly RuleEntry[] = []): RuleEntry[] {
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

/**
 * Ordered bash rules for a read-only agent. Later rules win, so the order is:
 * ask by default, shared allowlist, learned rules, the agent's own rules, the always-ask flags, then the help layer
 * (exact `<program> <subcommand> --help` commands only, see `helpPatterns`).
 * Re-adding a pattern moves it to its new position instead of keeping the old one.
 */
export function buildBashRules(
  rules: RuleSet,
  learned: readonly string[] = [],
  own: readonly RuleEntry[] = [],
): RuleEntry[] {
  const before = baseRules(rules, learned, own)
  return [...before, ...helpPatterns(rules, before).map((pattern): RuleEntry => [pattern, "allow"])]
}
