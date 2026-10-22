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

/**
 * Decide whether a bash pattern may be added to the allowlist of read-only agents.
 * Exact commands are accepted unless they write. Wildcards are only accepted for commands whose every read-only use
 * is safe (`wildcardSafe`) and for read-only git subcommands. This cannot prove a program never writes: the user
 * confirms the exact pattern, and the write guard and always-ask flags still apply on top.
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
