import { tool, type Hooks } from "@opencode-ai/plugin"
import { classifyPattern, normalizePattern } from "./classify.js"
import { PERMISSION_CONFIRM, TOOL_REVIEW, TOOL_UPDATE } from "./constants.js"
import type { GuardLog } from "./log.js"
import type { RuleSet } from "./rules.js"
import { review } from "./review.js"
import { loadStore, saveStore } from "./store.js"

export interface ToolDependencies {
  readOnly: ReadonlySet<string>
  rules: RuleSet
  log: GuardLog
  storeFile: string
  project: string
}

/**
 * The two tools behind the review command. Both refuse to run in a read-only agent, and the permission rules hide
 * them from those agents as well, so a read-only agent cannot extend its own allowlist.
 */
export function createTools({
  readOnly,
  rules,
  log,
  storeFile,
  project,
}: ToolDependencies): NonNullable<Hooks["tool"]> {
  return {
    [TOOL_REVIEW]: tool({
      description:
        "Summarize the readonly-guard log for read-only agents: commands blocked by the write guard, permission prompts and answers, and allowlist candidates with vetted pattern options ([OK]/[REFUSED]). Used by the review command. Changes nothing.",
      args: {
        limit: tool.schema.number().int().min(1).max(50).optional().describe("max candidates to list (default 10)"),
      },
      async execute(args, context) {
        if (readOnly.has(context.agent)) throw new Error(`${TOOL_REVIEW} is not available in read-only agents`)
        return review({ store: loadStore(storeFile), events: log.read(), rules, limit: args.limit ?? 10 })
      },
    }),

    [TOOL_UPDATE]: tool({
      description:
        'Update the readonly-guard allowlist for read-only agents. action "allow" adds a vetted bash pattern; the user must confirm the exact pattern in a permission prompt. "remove" deletes a learned pattern. "dismiss" stops proposing a candidate. Changes apply after restarting opencode.',
      args: {
        action: tool.schema.enum(["allow", "remove", "dismiss"]),
        value: tool.schema
          .string()
          .min(1)
          .describe("the exact bash pattern (allow/remove) or candidate pattern (dismiss)"),
      },
      async execute(args, context) {
        if (readOnly.has(context.agent)) throw new Error(`${TOOL_UPDATE} is not available in read-only agents`)
        const store = loadStore(storeFile)
        const value = normalizePattern(args.value)
        const record = { agent: context.agent, project }

        if (args.action === "allow") {
          const verdict = classifyPattern(value, rules.commands)
          if (!verdict.ok) throw new Error(`Refused "${value}": ${verdict.reason}`)
          if (store.allow.includes(value)) return `"${value}" is already in the allowlist.`
          await context.ask({
            permission: PERMISSION_CONFIRM,
            patterns: [value],
            always: [],
            metadata: {
              pattern: value,
              note: verdict.note,
              file: storeFile,
              effect: "allowed without prompting in read-only agents (plan, explore, edit-denied agents) after restart",
            },
          })
          store.allow.push(value)
          store.dismissed = store.dismissed.filter((dismissed) => dismissed !== value)
          saveStore(storeFile, store)
          log.write({ type: "learned", pattern: value, ...record })
          return `Added "${value}" to ${storeFile}. Restart opencode to apply it.`
        }

        if (args.action === "remove") {
          if (!store.allow.includes(value)) return `"${value}" is not in the allowlist.`
          store.allow = store.allow.filter((pattern) => pattern !== value)
          saveStore(storeFile, store)
          log.write({ type: "unlearned", pattern: value, ...record })
          return `Removed "${value}". Restart opencode to apply.`
        }

        if (!store.dismissed.includes(value)) store.dismissed.push(value)
        saveStore(storeFile, store)
        log.write({ type: "dismissed", pattern: value, ...record })
        return `Dismissed "${value}"; it will no longer be proposed.`
      },
    }),
  }
}
