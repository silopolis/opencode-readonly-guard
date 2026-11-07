import { readFileSync } from "node:fs"

/** The rule files the plugin reads at startup (`rules/*.json`). */
export const RULE_FILES = ["allow.json", "ask.json", "commands.json"] as const

export type RuleFile = (typeof RULE_FILES)[number]

/**
 * A Bun macro: imported `with { type: "macro" }`, it runs when Bun bundles or loads the importing module, and its
 * result replaces the call. It returns the rule files as they are at that moment, so that the build carries a copy
 * of them for when a file next to it cannot be read. A file that is not valid JSON fails the build.
 */
export function embedRules(): Record<RuleFile, string> {
  const read = (file: RuleFile) =>
    JSON.stringify(JSON.parse(readFileSync(new URL(`../rules/${file}`, import.meta.url), "utf8")))
  return { "allow.json": read("allow.json"), "ask.json": read("ask.json"), "commands.json": read("commands.json") }
}
