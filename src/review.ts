import { dirname } from "node:path"
import { classifyPattern, normalizePattern } from "./classify.js"
import { TOOL_UPDATE } from "./constants.js"
import { clip, type LogEvent } from "./log.js"
import { buildBashRules, type RuleSet } from "./rules.js"
import type { StoreData } from "./store.js"
import { evaluate } from "./wildcard.js"

/** Commands whose first argument is a subcommand, so statistics group by `git log` rather than `git`. */
const MULTI_WORD = new Set([
  "git",
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "cargo",
  "go",
  "docker",
  "podman",
  "kubectl",
  "systemctl",
  "gh",
  "pip",
  "uv",
  "mise",
  "opencode",
])

export function headOf(command: string): string {
  const words = normalizePattern(command).split(" ")
  if (words[0] === "rtk") return `rtk ${headOf(words.slice(1).join(" "))}`.trim()
  return MULTI_WORD.has(words[0]) && words[1] && !words[1].startsWith("-")
    ? `${words[0]} ${words[1]}`
    : (words[0] ?? "")
}

/** `cat /etc/hostname` → `cat /etc/*`, when the last word is a path with a directory part. */
export function scopeToDirectory(pattern: string): string | null {
  const words = normalizePattern(pattern).split(" ")
  const last = words.at(-1) ?? ""
  if (words.length < 2 || !last.includes("/") || last.startsWith("-") || /[*?]/.test(last)) return null
  const dir = dirname(last)
  if (!dir || dir === "." || dir === "/") return null
  return [...words.slice(0, -1), `${dir}/*`].join(" ")
}

const total = (entry: { once: number; always: number; reject: number }) => entry.once + entry.always + entry.reject

interface Candidate {
  pattern: string
  count: number
  agents: Set<string>
  always: Set<string>
  last: string
}

export interface ReviewInput {
  store: StoreData
  events: readonly LogEvent[]
  rules: RuleSet
  /** Maximum number of candidates to list. */
  limit?: number
}

/**
 * A Markdown report of the event log: allowlist candidates (from "always" answers) with vetted pattern options,
 * prompt statistics, suggestions, blocked commands and the learned rules. The report is addressed to the model that
 * runs the review command; it only ever offers patterns marked [OK].
 */
export function review({ store, events, rules, limit = 10 }: ReviewInput): string {
  const learned = store.allow.filter((pattern) => classifyPattern(pattern, rules.commands).ok)
  const bash = buildBashRules(rules, learned)
  const vet = (pattern: string) => classifyPattern(pattern, rules.commands)
  const out: string[] = []
  out.push("## readonly-guard review")
  out.push(
    `Log: ${events.length} events since ${events[0]?.ts ?? "-"} · learned allow rules: ${learned.length} · dismissed: ${store.dismissed.length}`,
  )

  // Candidates: "always" answers for bash in read-only agents
  const candidates = new Map<string, Candidate>()
  for (const event of events) {
    if (event.type !== "replied" || event.reply !== "always" || event.permission !== "bash") continue
    for (const raw of event.patterns ?? []) {
      const pattern = normalizePattern(raw)
      if (store.dismissed.includes(pattern) || evaluate(pattern, bash) === "allow") continue
      const candidate = candidates.get(pattern) ?? {
        pattern,
        count: 0,
        agents: new Set<string>(),
        always: new Set<string>(),
        last: "",
      }
      candidate.count++
      if (event.agent) candidate.agents.add(event.agent)
      for (const always of event.always ?? []) candidate.always.add(always)
      candidate.last = event.ts
      candidates.set(pattern, candidate)
    }
  }
  const listed = [...candidates.values()]
    .toSorted((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, limit)
  const shown = candidates.size > listed.length ? `, showing ${listed.length}` : ""
  out.push("", `### Candidates from "always" answers (${candidates.size}${shown})`)
  if (!listed.length) out.push("(none)")
  for (const [index, candidate] of listed.entries()) {
    const remembered = [...candidate.always].map((always) => `\`${always}\``).join(", ") || "-"
    out.push(
      `${index + 1}. \`${candidate.pattern}\`: ${candidate.count}×, agents: ${[...candidate.agents].join(", ")}, opencode remembered: ${remembered}`,
    )
    const options = [{ kind: "exact", pattern: candidate.pattern }]
    const scoped = scopeToDirectory(candidate.pattern)
    if (scoped) options.push({ kind: "directory", pattern: scoped })
    for (const always of candidate.always) options.push({ kind: "general", pattern: normalizePattern(always) })
    const seen = new Set<string>()
    for (const option of options) {
      if (seen.has(option.pattern)) continue
      seen.add(option.pattern)
      const verdict = vet(option.pattern)
      const caution = verdict.ok && verdict.note && verdict.note !== "exact command" ? ` (${verdict.note})` : ""
      const status = verdict.ok ? "[OK]" : `[REFUSED: ${verdict.reason}]`
      out.push(`   - ${status} ${option.kind}: \`${option.pattern}\`${caution}`)
    }
  }

  // Prompt statistics
  const stats = new Map<string, { once: number; always: number; reject: number }>()
  for (const event of events) {
    if (event.type !== "replied" || event.permission !== "bash") continue
    for (const pattern of event.patterns ?? []) {
      const head = headOf(pattern)
      const entry = stats.get(head) ?? { once: 0, always: 0, reject: 0 }
      if (event.reply === "once" || event.reply === "always" || event.reply === "reject") entry[event.reply]++
      stats.set(head, entry)
    }
  }
  const top = [...stats.entries()].toSorted((a, b) => total(b[1]) - total(a[1])).slice(0, 15)
  out.push("", "### Prompts in read-only agents by command (once / always / reject)")
  if (!top.length) out.push("(none)")
  for (const [head, entry] of top) out.push(`- \`${head}\`: ${entry.once} / ${entry.always} / ${entry.reject}`)
  const suggestions = top.filter(
    ([head, entry]) =>
      entry.once + entry.always >= 3 &&
      entry.reject === 0 &&
      vet(`${head} *`).ok &&
      evaluate(`${head} x`, bash) !== "allow",
  )
  if (suggestions.length) {
    out.push("", "### Suggested additions (≥3 approvals, 0 rejections, vetted)")
    for (const [head] of suggestions) out.push(`- [OK] general: \`${head} *\``)
  }

  // Blocks
  const blocks = new Map<string, { count: number; sample: string }>()
  for (const event of events) {
    if (event.type !== "blocked") continue
    const reason = event.reason ?? "?"
    const entry = blocks.get(reason) ?? { count: 0, sample: event.command ?? "" }
    entry.count++
    blocks.set(reason, entry)
  }
  out.push("", "### Blocked by the write guard")
  if (!blocks.size) out.push("(none)")
  for (const [reason, entry] of [...blocks.entries()].toSorted((a, b) => b[1].count - a[1].count).slice(0, 10)) {
    out.push(`- ${entry.count}× ${reason}, e.g. \`${clip(entry.sample, 120)}\``)
  }

  out.push("", "### Learned allow rules")
  if (!store.allow.length) out.push("(none)")
  for (const pattern of store.allow) {
    const verdict = vet(pattern)
    out.push(`- \`${pattern}\`${verdict.ok ? "" : ` [IGNORED at startup: ${verdict.reason}]`}`)
  }
  out.push(
    "",
    `Next steps: for each candidate or suggestion, ask the user which [OK] pattern to allow (or dismiss or skip). Never propose a pattern that is not listed as [OK]. Call ${TOOL_UPDATE} with action "allow" and the exact pattern; the user then confirms it in a permission prompt. Use action "dismiss" with the candidate pattern for rejected candidates.`,
  )
  return out.join("\n")
}
