import { createAnalyzer } from "./analyze.js"
import type { Commands } from "./rules.js"
import { simpleCommands } from "./shell.js"
import { evaluate, type RuleEntry } from "./wildcard.js"

export type Decision =
  | { verdict: "block"; reason: string }
  | { verdict: "allow" | "ask"; /** the first simple command that needs a prompt, if any */ prompts?: string }

/**
 * What a read-only agent experiences for a command line:
 *  - `block`: the write guard refuses it before any permission rule runs;
 *  - `ask`: some simple command in it needs the user's approval;
 *  - `allow`: every simple command is allowed without a prompt.
 *
 * opencode evaluates each simple command separately; this reproduces that on the parsed words, so quoting and
 * redirections are not part of the text the rules see (a close approximation of what opencode logs).
 */
export function decide(command: string, rules: readonly RuleEntry[], commands?: Commands): Decision {
  const verdict = createAnalyzer(commands).analyze(command)
  if (verdict.block) return { verdict: "block", reason: verdict.reason }
  for (const simple of simpleCommands(command)) {
    if (evaluate(simple, rules) !== "allow") return { verdict: "ask", prompts: simple }
  }
  return { verdict: "allow" }
}
