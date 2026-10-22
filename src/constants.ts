export const PLUGIN_ID = "opencode-readonly-guard"

/** Agents that are read-only by design in opencode. Others are detected from their `edit: deny` permission. */
export const DEFAULT_READ_ONLY_AGENTS: readonly string[] = ["plan", "explore"]

/** Internal agents that share a session with the user's agent but never run tools. */
export const UTILITY_AGENTS: ReadonlySet<string> = new Set(["title", "summary", "compaction"])

export const TOOL_REVIEW = "readonly_guard_review"
export const TOOL_UPDATE = "readonly_guard_update"

/** Permission name used for the confirmation prompt when a rule is added to the allowlist. */
export const PERMISSION_CONFIRM = "readonly_guard_allow"
