import { createAnalyzer } from "./analyze.js"
import { loadRules, type Commands } from "./rules.js"

export interface PatternVerdict {
  ok: boolean
  /** Why the pattern was refused. */
  reason?: string
  /** A caution for the user, shown next to an accepted pattern. */
  note?: string
}

const refuse = (reason: string): PatternVerdict => ({ ok: false, reason })

export const normalizePattern = (pattern: string): string => pattern.trim().replace(/\s+/g, " ")

const hasWildcard = (word: string): boolean => /[*?[]/.test(word)
const isOption = (word: string): boolean => word.startsWith("-")

const UI_NOTE = "opt-in UI command: it only changes what herdr displays, and is never part of the shared allowlist"

/** The leading words of herdr's arguments up to the first wildcard: the subcommand path and literal arguments. */
const literalWords = (rest: readonly string[]): readonly string[] => {
  const firstWildcard = rest.findIndex(hasWildcard)
  return firstWildcard < 0 ? rest : rest.slice(0, firstWildcard)
}

/** Does `literal` start with one of `subcommands` (herdr subcommand paths of one to three words)? */
const startsWithPath = (literal: readonly string[], subcommands: readonly string[]): boolean =>
  [1, 2, 3].some((n) => literal.length >= n && subcommands.includes(literal.slice(0, n).join(" ")))

/** Is this a pattern for one of herdr's opt-in UI subcommands (`herdr tab rename *`, `herdr notification show *`)? */
export function isHerdrUiPattern(raw: string, { herdr }: Commands): boolean {
  const words = normalizePattern(raw).split(" ")
  const at = words[0] === "rtk" ? 1 : 0
  return words[at] === "herdr" && startsWithPath(literalWords(words.slice(at + 1)), herdr.ui)
}

/**
 * herdr patterns are judged by subcommand, as for git. Only help, version and the read-only subcommands may be
 * allowed (with a wildcard after a read-only subcommand), plus the opt-in UI subcommands the user lists themselves.
 * Anything else changes panes, agents, layout or sessions: it always asks and can never be learned, exact or not.
 */
function classifyHerdr(rest: readonly string[], { herdr }: Commands): PatternVerdict {
  if (!rest.length) return refuse("herdr alone starts the terminal UI")
  if (rest.includes("--trust-repository")) return refuse("--trust-repository grants Git trust to a repository")

  const groupHelp = rest.length === 2 && (rest[1] === "--help" || rest[1] === "-h") && !isOption(rest[0])
  if (herdr.help.includes(groupHelp ? rest[0] : rest.join(" "))) return { ok: true, note: "prints help or the version" }
  if (isOption(rest[0])) {
    return refuse(
      "herdr global options (--machine, --session, --remote) send the command elsewhere: use the plain command",
    )
  }

  const literal = literalWords(rest)
  if (startsWithPath(literal, herdr.ui)) return { ok: true, note: UI_NOTE }
  if (startsWithPath(literal, herdr.read)) return { ok: true }

  if (literal.length < 2 && rest.some(hasWildcard)) {
    return refuse("herdr wildcards are only allowed after a read-only subcommand (agent list, pane read, …)")
  }
  return refuse(
    `herdr ${literal.slice(0, 2).join(" ")} is not a read-only herdr command: it can change panes, agents, layout or sessions, so it always asks`,
  )
}

/**
 * Decide whether a bash pattern may be added to the allowlist of read-only agents.
 * Exact commands are accepted unless they write. Wildcards are only accepted for commands whose every read-only use
 * is safe (`wildcardSafe`) and for read-only git and herdr subcommands. This cannot prove a program never writes:
 * the user confirms the exact pattern, and the write guard and always-ask flags still apply on top.
 */
export function classifyPattern(raw: string, commands: Commands = loadRules().commands): PatternVerdict {
  const pattern = normalizePattern(raw)
  if (!pattern) return refuse("empty pattern")
  if (pattern.length > 200) return refuse("pattern too long")
  if (/[;&|<>`\n]|\$\(|\$\{/.test(pattern)) return refuse("contains shell operators, redirection or substitution")

  const words = pattern.split(" ")
  const viaRtk = words[0] === "rtk"
  const at = viaRtk ? 1 : 0
  if (viaRtk && words[1] === "proxy") return refuse("`rtk proxy` passes arbitrary commands through")
  const name = words[at]
  if (!name || /[*?[]/.test(name)) return refuse("the command name must be literal (no wildcard)")

  const concrete = words.map((word) => word.replace(/[*?]/g, "")).filter(Boolean)
  const why = createAnalyzer(commands).commandWrites(concrete)
  if (why) return refuse(why)
  if (name === "herdr") return classifyHerdr(words.slice(at + 1), commands)

  const safe = new Set(commands.wildcardSafe)
  const known = name === "git" || safe.has(name) || (viaRtk && commands.rtkReadSubcommands.includes(name))
  if (!/[*?]/.test(pattern)) {
    return {
      ok: true,
      note: known
        ? "exact command"
        : `exact command; "${name}" is not a known read-only command, so check that it changes nothing`,
    }
  }
  if (name === "git") {
    const sub = words[at + 1]
    if (!sub || /[*?]/.test(sub) || !commands.git.read.includes(sub)) {
      return refuse("git wildcards are only allowed after a read-only subcommand (status, log, diff, show, …)")
    }
    return { ok: true }
  }
  if (!known) {
    return refuse(
      `wildcards are only allowed for known read-only commands; "${name}" is not one, so use the exact command`,
    )
  }
  return { ok: true }
}
