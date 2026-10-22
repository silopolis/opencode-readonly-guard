import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { classifyPattern, normalizePattern } from "./classify.js"
import { PLUGIN_ID } from "./constants.js"
import { decide } from "./decide.js"
import { createLog } from "./log.js"
import { resolveOptions } from "./options.js"
import { review } from "./review.js"
import { buildBashRules, loadRules } from "./rules.js"
import { loadStore } from "./store.js"

export interface CliIo {
  out(text: string): void
  err(text: string): void
  env: NodeJS.ProcessEnv
  /** Run a program with inherited stdio and return its exit status. */
  run(command: string, args: string[]): number
}

export const EXIT = { allow: 0, ask: 1, block: 2, usage: 64 } as const

const HELP = `Usage: opencode-readonly-guard <command>

Commands:
  check [--json] [--no-store] <command>   Explain what a read-only agent gets for a shell command.
                                          Exit status: 0 allow, 1 ask, 2 block.
  vet <pattern>                           Say whether a bash pattern may be added to the allowlist.
  rules [--json]                          Print the shared allowlist and the always-ask flags.
  review [--limit N] [--store F] [--log-dir D]
                                          Print the guard log summary (what /guard-review shows).
  install [-g] [--force]                  Install the plugin into opencode ('opencode plugin ${PLUGIN_ID}').

Options:
  -h, --help       Show this help.
  -v, --version    Show the version.
`

function version(): string {
  const file = new URL("../package.json", import.meta.url)
  return (JSON.parse(readFileSync(file, "utf8")) as { version: string }).version
}

/** Remove `flag` from `args` and report whether it was there. */
function takeFlag(args: string[], ...names: string[]): boolean {
  const index = args.findIndex((arg) => names.includes(arg))
  if (index < 0) return false
  args.splice(index, 1)
  return true
}

/** Remove `--name value` (or `--name=value`) from `args` and return the value. */
function takeValue(args: string[], name: string): string | undefined {
  const inline = args.findIndex((arg) => arg.startsWith(`${name}=`))
  if (inline >= 0) return args.splice(inline, 1)[0].slice(name.length + 1)
  const index = args.indexOf(name)
  if (index < 0) return undefined
  const [, value] = args.splice(index, 2)
  return value
}

function check(args: string[], io: CliIo): number {
  const json = takeFlag(args, "--json")
  const noStore = takeFlag(args, "--no-store")
  const command = args.join(" ")
  if (!command) {
    io.err("check: missing command\n")
    return EXIT.usage
  }
  const rules = loadRules()
  const options = resolveOptions({}, io.env)
  const learned = noStore
    ? []
    : loadStore(options.storeFile, () => undefined).allow.filter((p) => classifyPattern(p).ok)
  const decision = decide(command, buildBashRules(rules, learned))
  if (json) io.out(`${JSON.stringify({ command, ...decision })}\n`)
  else if (decision.verdict === "block") io.out(`block  ${decision.reason}\n`)
  else if (decision.verdict === "ask") io.out(`ask    needs approval: ${decision.prompts}\n`)
  else io.out("allow\n")
  return EXIT[decision.verdict]
}

function vet(args: string[], io: CliIo): number {
  const pattern = normalizePattern(args.join(" "))
  if (!pattern) {
    io.err("vet: missing pattern\n")
    return EXIT.usage
  }
  const verdict = classifyPattern(pattern)
  io.out(verdict.ok ? `ok${verdict.note ? `  (${verdict.note})` : ""}\n` : `refused  ${verdict.reason}\n`)
  return verdict.ok ? 0 : 1
}

function printRules(args: string[], io: CliIo): number {
  const rules = loadRules()
  if (takeFlag(args, "--json")) {
    io.out(`${JSON.stringify({ allow: rules.allow, ask: rules.ask }, null, 2)}\n`)
    return 0
  }
  io.out("Allowed without a prompt (read-only agents):\n")
  for (const { pattern, reason } of rules.allow) io.out(`  ${pattern.padEnd(22)} ${reason}\n`)
  io.out("\nAlways ask (override the allowlist and learned rules):\n")
  for (const { pattern, reason } of rules.ask) io.out(`  ${pattern.padEnd(22)} ${reason}\n`)
  return 0
}

function printReview(args: string[], io: CliIo): number {
  const limit = Number(takeValue(args, "--limit") ?? 10)
  if (!Number.isInteger(limit) || limit < 1) {
    io.err("review: --limit must be a positive integer\n")
    return EXIT.usage
  }
  const options = resolveOptions({ store: takeValue(args, "--store"), logDir: takeValue(args, "--log-dir") }, io.env)
  io.out(
    `${review({ store: loadStore(options.storeFile), events: createLog(options.logDir).read(), rules: loadRules(), limit })}\n`,
  )
  return 0
}

function install(args: string[], io: CliIo): number {
  const flags: string[] = []
  if (takeFlag(args, "-g", "--global")) flags.push("--global")
  if (takeFlag(args, "-f", "--force")) flags.push("--force")
  return io.run("opencode", ["plugin", PLUGIN_ID, ...flags])
}

/** Entry point of the command-line tool; returns the exit status. */
export function runCli(argv: readonly string[], io: CliIo): number {
  const args = [...argv]
  const command = args.shift()
  try {
    if (!command || command === "-h" || command === "--help" || command === "help") {
      io.out(HELP)
      return command ? 0 : EXIT.usage
    }
    if (command === "-v" || command === "--version") {
      io.out(`${version()}\n`)
      return 0
    }
    switch (command) {
      case "check":
        return check(args, io)
      case "vet":
        return vet(args, io)
      case "rules":
        return printRules(args, io)
      case "review":
        return printReview(args, io)
      case "install":
        return install(args, io)
      default:
        io.err(`unknown command: ${command}\n\n${HELP}`)
        return EXIT.usage
    }
  } catch (error) {
    io.err(`error: ${error instanceof Error ? error.message : String(error)}\n`)
    return 70
  }
}

/** The real environment: stdout, stderr and child processes. */
export function systemIo(): CliIo {
  return {
    out: (text) => void process.stdout.write(text),
    err: (text) => void process.stderr.write(text),
    env: process.env,
    run: (command, args) => spawnSync(command, args, { stdio: "inherit" }).status ?? 1,
  }
}
