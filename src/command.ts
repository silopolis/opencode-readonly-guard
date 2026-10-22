import type { MutableConfig } from "./inject.js"
import { TOOL_REVIEW, TOOL_UPDATE } from "./constants.js"

export const REVIEW_COMMAND_DESCRIPTION =
  "Review the read-only guard log (blocked commands, prompts) and confirm allowlist additions"

export const REVIEW_COMMAND_TEMPLATE = `Review the readonly-guard data. Do not edit any file yourself; only the ${TOOL_REVIEW} and ${TOOL_UPDATE} tools may change the allowlist.

1. Call the \`${TOOL_REVIEW}\` tool and show the user a short summary: blocked commands, the most-prompted commands, and the number of candidates.
2. If there are candidates or suggestions, use the question tool with at most 8 questions per round, one per candidate. Each question's options are:
   - the patterns marked [OK] by the tool, with the exact pattern as the label
   - "Dismiss" (stop proposing it)
   - "Skip" (decide later)

   Never offer, modify, or invent a pattern that the tool did not mark [OK].
3. For each chosen pattern, call \`${TOOL_UPDATE}\` with action "allow" and the exact pattern. The user confirms it again in a permission prompt. For "Dismiss", call it with action "dismiss" and the candidate pattern. For "Skip", do nothing.
4. Finish with a list of what was added or dismissed. Remind the user that additions take effect after restarting opencode.

$ARGUMENTS`

/** Register the review command unless the user already defined one with that name. */
export function registerReviewCommand(config: MutableConfig, name: string): boolean {
  config.command ??= {}
  if (config.command[name] !== undefined) return false
  config.command[name] = {
    description: REVIEW_COMMAND_DESCRIPTION,
    agent: "build",
    template: REVIEW_COMMAND_TEMPLATE,
  }
  return true
}
