import type { Plugin } from "@opencode-ai/plugin"
import { createAnalyzer } from "./analyze.js"
import { classifyPattern, normalizePattern } from "./classify.js"
import { UTILITY_AGENTS } from "./constants.js"
import { injectRules, type MutableConfig } from "./inject.js"
import { clip, createLog } from "./log.js"
import { resolveOptions } from "./options.js"
import { loadRules } from "./rules.js"
import { loadStore } from "./store.js"

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

export const server: Plugin = async ({ client, worktree }, rawOptions) => {
  const options = resolveOptions(rawOptions)
  const rules = loadRules()
  const analyzer = createAnalyzer(rules.commands)
  const guardLog = createLog(options.logDir)
  const readOnly = new Set<string>()
  const agentOf = new Map<string, string>()
  const asks = new Map<string, AskRecord>()

  for (const warning of options.warnings) guardLog.write({ type: "error", where: "options", error: warning })

  const agentFor = async (sessionID: string): Promise<string | undefined> => {
    const known = agentOf.get(sessionID)
    if (known) return known
    try {
      const response = await client.session.get({ path: { id: sessionID } })
      const agent = (response.data as { agent?: unknown } | undefined)?.agent
      if (typeof agent !== "string") return undefined
      agentOf.set(sessionID, agent)
      return agent
    } catch {
      return undefined
    }
  }

  const vetted = (patterns: readonly string[], where: string): string[] =>
    patterns.map(normalizePattern).filter((pattern) => {
      const verdict = classifyPattern(pattern, rules.commands)
      if (!verdict.ok) guardLog.write({ type: "error", where, pattern, error: `ignored rule: ${verdict.reason}` })
      return verdict.ok
    })

  return {
    config: async (config) => {
      const store = loadStore(options.storeFile, (error) =>
        guardLog.write({ type: "error", where: "store", error: String(error.cause ?? error) }),
      )
      const learned = [...vetted(store.allow, "store"), ...vetted(options.allow, "options")]
      const names = injectRules(config as MutableConfig, {
        rules,
        learned,
        include: [...options.includeAgents, ...store.agents.include],
        exclude: [...options.excludeAgents, ...store.agents.exclude],
      })
      readOnly.clear()
      for (const name of names) readOnly.add(name)
      guardLog.write({ type: "init", project: worktree, roAgents: [...names], learned: learned.length })
    },

    "chat.params": async (input) => {
      if (input.sessionID && input.agent && !UTILITY_AGENTS.has(input.agent)) agentOf.set(input.sessionID, input.agent)
    },

    "tool.execute.before": async (input, output) => {
      const tool = String(input.tool ?? "").toLowerCase()
      if (tool !== "bash" && tool !== "shell") return
      const command: unknown = output.args?.command
      if (typeof command !== "string" || !command) return
      const agent = await agentFor(input.sessionID)
      if (!agent || !readOnly.has(agent)) return
      const verdict = analyzer.analyze(command)
      const record = {
        sessionID: input.sessionID,
        callID: input.callID,
        agent,
        project: worktree,
        command: clip(command),
      }
      if (verdict.block) {
        guardLog.write({ type: "blocked", reason: verdict.reason, ...record })
        throw new Error(`[readonly-guard] Blocked in read-only agent "${agent}": ${verdict.reason}.\n${BLOCK_ADVICE}`)
      }
      guardLog.write({ type: "call", ...record })
    },

    event: async ({ event }) => {
      const { type, properties: p = {} } = event as unknown as RuntimeEvent
      if (type === "permission.asked" && p.id && p.sessionID) {
        const agent = agentOf.get(p.sessionID)
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
        if (id) agentOf.delete(id)
      }
    },
  }
}
