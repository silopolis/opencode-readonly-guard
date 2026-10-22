import { DEFAULT_READ_ONLY_AGENTS, PERMISSION_CONFIRM, TOOL_REVIEW, TOOL_UPDATE } from "./constants.js"
import { buildBashRules, type RuleSet } from "./rules.js"
import type { Action, RuleEntry } from "./wildcard.js"

/** The parts of opencode's config this plugin edits. */
export interface MutableConfig {
  agent?: Record<string, AgentConfig | undefined>
  permission?: unknown
  command?: Record<string, unknown>
  [key: string]: unknown
}

export interface AgentConfig {
  disable?: boolean
  permission?: unknown
  tools?: Record<string, boolean>
  [key: string]: unknown
}

export interface InjectInput {
  rules: RuleSet
  /** Learned and option-supplied patterns, already vetted. */
  learned: readonly string[]
  include: readonly string[]
  exclude: readonly string[]
}

type PermissionTable = Record<string, unknown>

const ACTIONS: ReadonlySet<string> = new Set(["allow", "ask", "deny"])

/** opencode accepts `"allow"` or `{ pattern: action }` for a permission; normalize to the object form. */
function asTable(value: unknown): PermissionTable {
  if (value === undefined || value === null) return {}
  if (typeof value === "string") return { "*": value }
  return { ...(value as PermissionTable) }
}

function ownBashRules(value: unknown): RuleEntry[] {
  return Object.entries(asTable(value)).filter((entry): entry is [string, Action] => ACTIONS.has(String(entry[1])))
}

/** Is edit denied for this agent (so that it is meant to be read-only)? */
export function isEditDenied(agent: AgentConfig | undefined): boolean {
  if (!agent) return false
  const permission = agent.permission
  if (permission === "deny") return true
  if (agent.tools?.edit === false) return true
  if (typeof permission !== "object" || permission === null) return false
  const edit = (permission as PermissionTable).edit
  return edit === "deny" || (typeof edit === "object" && edit !== null && (edit as PermissionTable)["*"] === "deny")
}

/**
 * Add the read-only bash policy to every read-only agent and return their names.
 *
 * Read-only agents are `plan`, `explore`, agents with `edit: deny`, and `include`, minus `exclude`. Unknown agents
 * named in `include` are not created. An agent whose bash is fully denied stays that way.
 */
export function injectRules(config: MutableConfig, input: InjectInput): Set<string> {
  config.agent ??= {}
  const names = new Set<string>([...DEFAULT_READ_ONLY_AGENTS, ...input.include])
  for (const [name, agent] of Object.entries(config.agent)) if (isEditDenied(agent)) names.add(name)
  for (const name of input.exclude) names.delete(name)

  const readOnly = new Set<string>()
  for (const name of names) {
    const known = config.agent[name]
    if (!known && !DEFAULT_READ_ONLY_AGENTS.includes(name)) continue
    const agent = (config.agent[name] ??= {})
    if (agent.disable) continue
    const permission = asTable(agent.permission)
    const own = ownBashRules(permission.bash)
    if (!own.some(([pattern, action]) => pattern === "*" && action === "deny")) {
      permission.bash = Object.fromEntries(
        buildBashRules(
          input.rules,
          input.learned,
          own.filter(([pattern]) => pattern !== "*"),
        ),
      )
    }
    permission[TOOL_REVIEW] = "deny"
    permission[TOOL_UPDATE] = "deny"
    agent.permission = permission
    readOnly.add(name)
  }

  const plan = config.agent.plan
  if (readOnly.has("plan") && plan) {
    const permission = asTable(plan.permission)
    const task = asTable(permission.task)
    delete task["*"]
    permission.task = {
      "*": "ask",
      ...task,
      general: "deny",
      ...Object.fromEntries([...readOnly].filter((name) => name !== "plan").map((name) => [name, "allow"])),
    }
    plan.permission = permission
  }

  // Appended after every agent's own rules, so it prompts even under `"*": "allow"`.
  config.permission = { ...asTable(config.permission), [PERMISSION_CONFIRM]: "ask" }
  return readOnly
}
