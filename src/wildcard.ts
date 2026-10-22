export type Action = "allow" | "ask" | "deny"
export type RuleEntry = readonly [pattern: string, action: Action]

/**
 * opencode's `Wildcard.match`: `*` matches anything, `?` one character, and a trailing ` *` also matches the bare
 * command (`ls *` matches `ls`). Backslashes are treated as path separators.
 */
export function wildcardMatch(input: string, pattern: string): boolean {
  const text = input.replaceAll("\\", "/")
  let source = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  if (source.endsWith(" .*")) source = source.slice(0, -3) + "( .*)?"
  return new RegExp(`^${source}$`, "s").test(text)
}

/** The action of the last matching rule (opencode evaluates permission rules in order, last match wins). */
export function evaluate(command: string, rules: readonly RuleEntry[], fallback: Action = "ask"): Action {
  let action = fallback
  for (const [pattern, ruleAction] of rules) if (wildcardMatch(command, pattern)) action = ruleAction
  return action
}
