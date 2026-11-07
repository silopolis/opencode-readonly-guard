import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin"
import { createAnalyzer, type Analyzer } from "./analyze.js"
import { registerReviewCommand } from "./command.js"
import { UTILITY_AGENTS } from "./constants.js"
import { failedCopies, registerCopy, registerFailedCopy } from "./copies.js"
import { failClosed, injectRules, type MutableConfig } from "./inject.js"
import { clip, createLog, describeError, type GuardLog } from "./log.js"
import { resolveOptions, type ResolvedOptions } from "./options.js"
import { loadCommands, loadRules, type Commands, type RuleFallback, type RuleSet } from "./rules.js"
import { effectiveRules, loadHerdrRules } from "./sources.js"
import { loadStore } from "./store.js"
import { createTools } from "./tools.js"

/** opencode's runtime events are richer than the v1 SDK types: permission events arrive as `permission.asked`. */
interface RuntimeEvent {
  type?: string
  properties?: {
    id?: string
    requestID?: string
    sessionID?: string
    permission?: string
    patterns?: string[]
    always?: string[]
    reply?: string
    metadata?: { command?: unknown }
    tool?: { callID?: string }
    info?: { id?: string }
  }
}

type AskRecord = {
  sessionID?: string
  agent: string
  project: string
  permission?: string
  patterns?: string[]
  always?: string[]
  command?: string
  callID?: string
}

const BLOCK_ADVICE =
  "Read-only agents must not modify files or system state. Return the information in your reply instead " +
  "(do not redirect output to files), or ask the user to switch to a write-capable agent such as build. " +
  "If this is a false positive, rephrase the command without shell redirection or write operations."

/** What the plugin reads at startup; tests replace it to simulate a broken installation. */
export interface ServerDependencies {
  /** `rules/commands.json`: all the write guard needs. */
  loadCommands(): Commands
  /** Every rule file: what the policy injected into read-only agents needs. */
  loadRules(): RuleSet
}

/** Which agent each session belongs to. */
function createSessions(client: PluginInput["client"]) {
  const agents = new Map<string, string>()
  return {
    /** Record the agent of a model call. Utility agents share the user's session and never run tools. */
    track(sessionID: string | undefined, agent: string | undefined): void {
      if (sessionID && agent && !UTILITY_AGENTS.has(agent)) agents.set(sessionID, agent)
    },
    /** The agent last seen in a session, without asking opencode. */
    known: (sessionID: string): string | undefined => agents.get(sessionID),
    forget: (sessionID: string): void => void agents.delete(sessionID),
    /** The agent last seen in a session, else the one opencode reports (the v1 SDK types do not expose it). */
    async agentOf(sessionID: string): Promise<string | undefined> {
      const known = agents.get(sessionID)
      if (known) return known
      try {
        const response = await client.session.get({ path: { id: sessionID } })
        const agent = (response.data as { agent?: unknown } | undefined)?.agent
        if (typeof agent !== "string") return undefined
        agents.set(sessionID, agent)
        return agent
      } catch {
        return undefined
      }
    },
  }
}

type Sessions = ReturnType<typeof createSessions>
type ToolBefore = NonNullable<Hooks["tool.execute.before"]>

/** The write guard: refuse a shell command that writes, in a read-only agent, before opencode's permission check. */
function writeGuard(
  analyzer: Analyzer,
  sessions: Sessions,
  readOnly: ReadonlySet<string>,
  guardLog: GuardLog,
  project: string,
): ToolBefore {
  return async (input, output) => {
    const tool = String(input.tool ?? "").toLowerCase()
    if (tool !== "bash" && tool !== "shell") return
    const command: unknown = output.args?.command
    if (typeof command !== "string" || !command) return
    const agent = await sessions.agentOf(input.sessionID)
    if (!agent || !readOnly.has(agent)) return
    const verdict = analyzer.analyze(command)
    const record = { sessionID: input.sessionID, callID: input.callID, agent, project, command: clip(command) }
    if (verdict.block) {
      guardLog.write({ type: "blocked", reason: verdict.reason, ...record })
      throw new Error(`[readonly-guard] Blocked in read-only agent "${agent}": ${verdict.reason}.\n${BLOCK_ADVICE}`)
    }
    guardLog.write({ type: "call", ...record })
  }
}

/**
 * Tell the user about a broken installation. Not awaited: during startup the request waits for the opencode
 * instance that is being started. A TUI receives it (it listens to the global event stream before the instance boots).
 */
function startupToast(client: PluginInput["client"], title: string, message: string, variant: "warning" | "error") {
  try {
    client.tui
      .showToast({
        body: { title, message: `${message} Run \`opencode-readonly-guard doctor\`.`, variant, duration: 15000 },
      })
      .catch(() => undefined)
  } catch {
    // the error event in the log is the lasting record
  }
}

/** Tell the user that the guard could not start and failed closed. */
function warnFailure(client: PluginInput["client"], reason: string, guarded: boolean): void {
  const effect = guarded
    ? "Read-only agents ask before every command until it is fixed."
    : "Read-only agents ask before every command, and the write guard is OFF, until it is fixed."
  startupToast(client, "readonly-guard failed to start", `${reason}. ${effect}`, "error")
}

/** Tell the user that a rule file could not be read and the copy built into the plugin replaced it. */
function warnFallback(client: PluginInput["client"], fallbacks: readonly RuleFallback[]): void {
  const reasons = fallbacks.map((fallback) => fallback.error).join("; ")
  const effect = "Until the file is fixed, the copy of the rules built into the plugin applies."
  startupToast(client, "readonly-guard: a rule file cannot be read", `${reasons}. ${effect}`, "warning")
}

/** The agent lists of the options and the store. */
function agentLists(options: ResolvedOptions, onStoreError?: (error: Error) => void) {
  const store = loadStore(options.storeFile, onStoreError ?? (() => undefined))
  return {
    store,
    include: [...options.includeAgents, ...store.agents.include],
    exclude: [...options.excludeAgents, ...store.agents.exclude],
  }
}

export function createServer(overrides: Partial<ServerDependencies> = {}): Plugin {
  const dependencies: ServerDependencies = { loadCommands, loadRules, ...overrides }
  return async (pluginInput, rawOptions) => {
    const options = resolveOptions(rawOptions)
    const guardLog = createLog(options.logDir)
    // One file at a time: the write guard only needs commands.json, so it stays on when another file is broken.
    let analyzer: Analyzer
    try {
      analyzer = createAnalyzer(dependencies.loadCommands())
    } catch (error) {
      return failedCopy(pluginInput, options, guardLog, error)
    }
    let rules: RuleSet
    try {
      rules = dependencies.loadRules()
    } catch (error) {
      return failedCopy(pluginInput, options, guardLog, error, analyzer)
    }
    return startedCopy(pluginInput, options, guardLog, rules, analyzer)
  }
}

export const server: Plugin = createServer()

/**
 * The hooks of a copy whose rule files cannot be read. opencode would drop a plugin whose `server()` throws, and
 * leave read-only agents with its defaults (`bash: allow`, no write guard). Unless a copy that started is in charge,
 * this one fails closed instead: every read-only agent asks before every command, the write guard stays on if
 * `commands.json` could be read (`analyzer`), and the failure is logged.
 */
function failedCopy(
  pluginInput: PluginInput,
  options: ResolvedOptions,
  guardLog: GuardLog,
  error: unknown,
  analyzer?: Analyzer,
): Hooks {
  const reason = describeError(error)
  const copy = registerFailedCopy(pluginInput, { module: import.meta.url, error: reason, writeGuard: !!analyzer })
  const sessions = createSessions(pluginInput.client)
  const readOnly = new Set<string>()
  const guard = analyzer && writeGuard(analyzer, sessions, readOnly, guardLog, pluginInput.worktree)

  return {
    config: async (config) => {
      if (!copy.inCharge()) return
      const names = failClosed(config as MutableConfig, agentLists(options))
      for (const name of names) readOnly.add(name)
      guardLog.write({
        type: "error",
        where: "load",
        error: reason,
        writeGuard: !!guard,
        project: pluginInput.worktree,
        roAgents: [...names],
        module: import.meta.url,
      })
      warnFailure(pluginInput.client, reason, !!guard)
    },

    "chat.params": async (input) => {
      if (copy.inCharge()) sessions.track(input.sessionID, input.agent)
    },

    "tool.execute.before": async (input, output) => {
      if (copy.inCharge()) await guard?.(input, output)
    },

    event: async ({ event }) => {
      if (!copy.inCharge()) return
      const { type, properties: p = {} } = event as unknown as RuntimeEvent
      const id = type === "session.deleted" ? (p.info?.id ?? p.sessionID) : undefined
      if (id) sessions.forget(id)
    },
  }
}

function startedCopy(
  pluginInput: PluginInput,
  options: ResolvedOptions,
  guardLog: GuardLog,
  rules: RuleSet,
  analyzer: Analyzer,
): Hooks {
  const { client, worktree } = pluginInput
  const readOnly = new Set<string>()
  const sessions = createSessions(client)
  const asks = new Map<string, AskRecord>()
  // Registered once the setup above succeeded: a copy that fails to start never takes charge.
  const copy = registerCopy(pluginInput, {
    module: import.meta.url,
    tools: createTools({ readOnly, rules, log: guardLog, storeFile: options.storeFile, project: worktree, options }),
  })
  const guard = writeGuard(analyzer, sessions, readOnly, guardLog, worktree)

  const fallbacks = rules.fallbacks ?? []

  const applyPolicy = (config: MutableConfig) => {
    for (const { file, error } of fallbacks) guardLog.write({ type: "error", where: "rules", file, error })
    for (const warning of options.warnings) guardLog.write({ type: "error", where: "options", error: warning })
    const { store, include, exclude } = agentLists(options, (error) =>
      guardLog.write({ type: "error", where: "store", error: String(error.cause ?? error) }),
    )
    const herdr = loadHerdrRules(options, (error) =>
      guardLog.write({ type: "error", where: "herdr config", error: String(error.cause ?? error) }),
    )
    const effective = effectiveRules({ commands: rules.commands, store, options, herdr })
    for (const problem of effective.problems) guardLog.write({ type: "error", ...problem })
    const names = injectRules(config, { rules, learned: effective.patterns, include, exclude })
    readOnly.clear()
    for (const name of names) readOnly.add(name)
    if (options.command) registerReviewCommand(config, options.command)
    guardLog.write({
      type: "init",
      project: worktree,
      roAgents: [...names],
      learned: effective.learned.length,
      presets: effective.presets,
      module: import.meta.url,
      copies: copy.modules(),
      failed: failedCopies(pluginInput).map(({ module, error }) => ({ module, error })),
      builtin: fallbacks.map(({ file }) => file),
    })
  }

  // Every hook of a copy that is not in charge returns at once (another copy of the plugin was loaded after it).
  return {
    config: async (config) => {
      if (!copy.active()) return
      try {
        applyPolicy(config as MutableConfig)
        if (fallbacks.length) warnFallback(client, fallbacks)
      } catch (error) {
        // opencode would log it and go on, with read-only agents half configured or not at all: fail closed
        const names = failClosed(config as MutableConfig, agentLists(options))
        readOnly.clear()
        for (const name of names) readOnly.add(name)
        const reason = describeError(error)
        guardLog.write({
          type: "error",
          where: "config",
          error: reason,
          writeGuard: true,
          project: worktree,
          roAgents: [...names],
          module: import.meta.url,
        })
        warnFailure(client, reason, true)
      }
    },

    // Read by opencode after every copy has started, so only the copy in charge registers the tools.
    get tool() {
      return copy.active() ? copy.tools : undefined
    },

    "chat.params": async (input) => {
      if (copy.active()) sessions.track(input.sessionID, input.agent)
    },

    "tool.execute.before": async (input, output) => {
      if (copy.active()) await guard(input, output)
    },

    event: async ({ event }) => {
      if (!copy.active()) return
      const { type, properties: p = {} } = event as unknown as RuntimeEvent
      if (type === "permission.asked" && p.id && p.sessionID) {
        const agent = sessions.known(p.sessionID)
        if (!agent || !readOnly.has(agent)) return
        const command = typeof p.metadata?.command === "string" ? clip(p.metadata.command) : undefined
        const record: AskRecord = {
          sessionID: p.sessionID,
          agent,
          project: worktree,
          permission: p.permission,
          patterns: p.patterns,
          always: p.always,
          command,
          callID: p.tool?.callID,
        }
        asks.set(p.id, record)
        guardLog.write({ type: "asked", requestID: p.id, ...record })
      } else if (type === "permission.replied" && p.requestID) {
        const record = asks.get(p.requestID)
        if (!record) return
        asks.delete(p.requestID)
        guardLog.write({ type: "replied", requestID: p.requestID, reply: p.reply, ...record })
        if (p.reply === "always" && record.permission === "bash" && options.toast) {
          const always = record.always?.join(", ") || "?"
          const queued = (record.patterns ?? []).join(" | ")
          await client.tui
            .showToast({
              body: {
                title: "readonly-guard",
                message: `opencode now allows "${always}" in ALL agents until restart. Queued for review: ${queued}`,
                variant: "warning",
                duration: 10000,
              },
            })
            .catch(() => undefined)
        }
      } else if (type === "session.deleted") {
        const id = p.info?.id ?? p.sessionID
        if (id) sessions.forget(id)
      }
    },
  }
}
