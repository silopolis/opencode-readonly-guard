import { homedir } from "node:os"
import { join } from "node:path"

/** Plugin options, as set in `opencode.json`: `"plugin": [["opencode-readonly-guard", { … }]]`. */
export interface GuardOptions {
  agents?: {
    /** Treat these agents as read-only in addition to `plan`, `explore` and agents with `edit: deny`. */
    include?: string[]
    /** Never touch these agents. */
    exclude?: string[]
  }
  /** Extra bash patterns to allow in read-only agents. Each one must pass the same safety check as learned rules. */
  allow?: string[]
  /** Where learned rules are stored. Default: `$XDG_CONFIG_HOME/opencode/readonly-guard.json`. */
  store?: string
  /** Where the event log is written. Default: `$XDG_DATA_HOME/opencode/readonly-guard`. */
  logDir?: string
  /** Show a warning toast when an "always" answer is given in a read-only agent. Default: true. */
  toast?: boolean
  /** Name of the review command, or false to not register it. Default: `guard-review`. */
  command?: string | false
}

export interface ResolvedOptions {
  includeAgents: string[]
  excludeAgents: string[]
  allow: string[]
  storeFile: string
  logDir: string
  toast: boolean
  command: string | false
  /** Problems found in the supplied options (ignored values). */
  warnings: string[]
}

const text = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined)

const stringList = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as string[]) : undefined

/**
 * Validate options and apply defaults. Precedence for paths: option, then `READONLY_GUARD_STORE` /
 * `READONLY_GUARD_DATA` (handy in tests), then the XDG defaults.
 */
export function resolveOptions(raw: unknown, env: NodeJS.ProcessEnv = process.env): ResolvedOptions {
  const options = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const warnings: string[] = []
  const take = <T>(key: string, parse: (value: unknown) => T | undefined, fallback: T): T => {
    if (options[key] === undefined) return fallback
    const parsed = parse(options[key])
    if (parsed === undefined) warnings.push(`option "${key}" ignored: unexpected value`)
    return parsed ?? fallback
  }
  const agents =
    typeof options.agents === "object" && options.agents !== null ? (options.agents as Record<string, unknown>) : {}
  const configHome = env.XDG_CONFIG_HOME || join(homedir(), ".config")
  const dataHome = env.XDG_DATA_HOME || join(homedir(), ".local", "share")

  return {
    includeAgents: stringList(agents.include) ?? [],
    excludeAgents: stringList(agents.exclude) ?? [],
    allow: take("allow", stringList, []),
    storeFile: take("store", text, env.READONLY_GUARD_STORE || join(configHome, "opencode", "readonly-guard.json")),
    logDir: take("logDir", text, env.READONLY_GUARD_DATA || join(dataHome, "opencode", "readonly-guard")),
    toast: take("toast", (value) => (typeof value === "boolean" ? value : undefined), true),
    command: take<string | false>("command", (value) => (value === false ? false : text(value)), "guard-review"),
    warnings,
  }
}
