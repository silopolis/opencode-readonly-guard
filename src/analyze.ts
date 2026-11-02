import { basename } from "node:path"
import { loadRules, type Commands } from "./rules.js"
import { parseShell, type Redirection } from "./shell.js"

export type Verdict = { block: false } | { block: true; reason: string }

/** Redirection targets that never write anything. */
export const SAFE_TARGETS: ReadonlySet<string> = new Set([
  "/dev/null",
  "/dev/stdout",
  "/dev/stderr",
  "/dev/tty",
  "/dev/fd/1",
  "/dev/fd/2",
])

const WRAPPERS = new Set([
  "sudo",
  "doas",
  "nohup",
  "nice",
  "ionice",
  "command",
  "builtin",
  "exec",
  "stdbuf",
  "unbuffer",
  "setsid",
  "chronic",
])
const WRAPPER_OPTIONS_WITH_ARGUMENT = new Set(["-u", "-g", "-n", "-c", "-p", "-C", "-o", "-e", "-i", "-U"])
const XARGS_OPTIONS_WITH_ARGUMENT = new Set([
  "-I",
  "-n",
  "-P",
  "-d",
  "-a",
  "-E",
  "-L",
  "-s",
  "--max-args",
  "--max-procs",
  "--delimiter",
  "--arg-file",
  "--replace",
])
const KEYWORDS = new Set([
  "{",
  "}",
  "!",
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "do",
  "done",
  "while",
  "until",
  "for",
  "case",
  "esac",
  "in",
  "function",
  "select",
  "time",
  "coproc",
  "[[",
  "]]",
])
/** herdr's global options that take a value (`--session NAME`, `--machine LABEL`, ...). */
const HERDR_OPTIONS_WITH_ARGUMENT = new Set(["--session", "--machine", "--remote", "--remote-keybindings"])
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish"])
const COMPRESSORS = new Set(["gzip", "gunzip", "bzip2", "bunzip2", "xz", "unxz", "zstd", "unzstd", "lz4"])
const MAX_DEPTH = 5

/**
 * `<subcommand path> --help` and nothing else: git (which turns it into `git help <subcommand>`), herdr, npm and
 * mise print the help and run nothing, so it is not the subcommand's write. Only a sole trailing `--help` after at
 * most `maxWords` plain words counts; `-h` and `--help` next to other options are judged as usual.
 */
const helpRequest = (args: readonly string[], maxWords: number): boolean =>
  args.length >= 2 &&
  args.length <= maxWords + 1 &&
  args.at(-1) === "--help" &&
  args.slice(0, -1).every((arg) => !arg.startsWith("-"))

function redirectionWrites({ op, target }: Redirection): string | null {
  const base = op.replace(/^(\d+|\{[^}]*\})/, "")
  if (base === "<" || base === "<<<" || base === "<&") return null
  if (base === ">(") return "output process substitution >(…)"
  if (base === ">&" && /^(\d+|-)$/.test(target)) return null // fd duplication, e.g. 2>&1
  if (SAFE_TARGETS.has(target)) return null
  return `write redirection "${op} ${target || "?"}"`
}

function commandStart(words: readonly string[]): number {
  let k = 0
  const skipOptions = (withArgument: ReadonlySet<string>) => {
    while (k < words.length && words[k].startsWith("-")) {
      const option = words[k++]
      if (withArgument.has(option)) k++
    }
  }
  while (k < words.length) {
    const word = words[k]
    const name = basename(word)
    if (KEYWORDS.has(word)) {
      k++
      continue
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/.test(word)) {
      k++ // VAR=value
      continue
    }
    if (name === "command" && (words[k + 1] === "-v" || words[k + 1] === "-V")) return words.length // lookup only
    if (WRAPPERS.has(name)) {
      k++
      skipOptions(WRAPPER_OPTIONS_WITH_ARGUMENT)
      continue
    }
    if (name === "env") {
      k++
      while (k < words.length && (words[k].startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[k]))) {
        const option = words[k++]
        if (option === "-u" || option === "-C" || option === "-S") k++
      }
      continue
    }
    if (name === "timeout") {
      k++
      skipOptions(new Set(["-s", "-k", "--signal", "--kill-after"]))
      k++ // the duration
      continue
    }
    if (name === "xargs") {
      k++
      skipOptions(XARGS_OPTIONS_WITH_ARGUMENT)
      continue
    }
    if (name === "watch") {
      k++
      skipOptions(new Set(["-n", "--interval"]))
      continue
    }
    if (name === "rtk") {
      k++
      if (words[k] === "proxy") k++
      continue
    }
    break
  }
  return k
}

/** uniq's options that take a value: `-f N`, `-s N`, `-w N` and their long forms (abbreviations included). */
const UNIQ_SHORT_WITH_VALUE = new Set(["f", "s", "w"])
const UNIQ_LONG_WITH_VALUE = ["skip-fields", "skip-chars", "check-chars"]

/** The OUTPUT operand of `uniq [OPTION]... [INPUT [OUTPUT]]`, if any. `-` and numbers are operands too. */
function uniqOutput(args: readonly string[]): string | undefined {
  const operands: string[] = []
  for (let j = 0; j < args.length; j++) {
    const arg = args[j]
    if (arg === "--") {
      operands.push(...args.slice(j + 1))
      break
    }
    if (arg === "-" || !arg.startsWith("-")) {
      operands.push(arg)
    } else if (arg.startsWith("--")) {
      const name = arg.slice(2)
      if (!name.includes("=") && UNIQ_LONG_WITH_VALUE.some((option) => option.startsWith(name))) j++
    } else {
      // a cluster of short options (`-cf 1`, `-f1`): the first one that takes a value ends it
      const at = Array.from(arg.slice(1)).findIndex((letter) => UNIQ_SHORT_WITH_VALUE.has(letter))
      if (at === arg.length - 2) j++
    }
  }
  return operands[1]
}

function curlWrites(args: readonly string[]): string | null {
  for (let j = 0; j < args.length; j++) {
    const arg = args[j]
    if (
      ["-O", "--remote-name", "--remote-name-all", "--create-dirs", "--output-dir"].includes(arg) ||
      /^-[a-zA-Z]*O$/.test(arg)
    ) {
      return "curl writes a file"
    }
    if (["-o", "--output", "-D", "--dump-header", "-c", "--cookie-jar"].includes(arg) || /^-[a-zA-Z]+o$/.test(arg)) {
      const target = args[j + 1]
      if (target !== "-" && !SAFE_TARGETS.has(target ?? "")) return `curl ${arg} writes a file`
    }
    if (arg.startsWith("--output=")) {
      const target = arg.slice("--output=".length)
      if (target !== "-" && !SAFE_TARGETS.has(target)) return "curl --output writes a file"
    }
  }
  return null
}

export interface Analyzer {
  /** Decide whether a command line modifies files or system state. */
  analyze(command: string, depth?: number): Verdict
  /** Why a single simple command (already split into words) writes, or null. */
  commandWrites(words: readonly string[], depth?: number): string | null
}

const analyzers = new WeakMap<Commands, Analyzer>()

/** Build (and cache) an analyzer for a command classification. */
export function createAnalyzer(commands: Commands = loadRules().commands): Analyzer {
  const existing = analyzers.get(commands)
  if (existing) return existing

  const hardWrite = new Set(commands.hardWrite)
  const packageManagers = new Set(commands.packageManagers.names)
  const packageWrite = new Set(commands.packageManagers.writeSubcommands)
  const gitWrite = new Set(commands.git.write)
  const herdrWrite = new Set(commands.herdr.write)

  function analyzeCommand(command: string, depth = 0): Verdict {
    if (depth > MAX_DEPTH) return { block: true, reason: "command nesting too deep to analyze" }
    const parsed = parseShell(command)
    if (parsed.error) return { block: true, reason: `could not parse the command (${parsed.error})` }
    for (const simple of parsed.cmds) {
      for (const redirection of simple.redirs) {
        const why = redirectionWrites(redirection)
        if (why) return { block: true, reason: why }
      }
      const why = commandWrites(simple.words, depth)
      if (why) return { block: true, reason: why }
    }
    for (const sub of parsed.subs) {
      const verdict = analyzeCommand(sub, depth + 1)
      if (verdict.block) return verdict
    }
    return { block: false }
  }

  /** Index of the real command in `words`, after skipping assignments, keywords and wrappers. */

  function commandWrites(words: readonly string[], depth = 0): string | null {
    const k = commandStart(words)
    if (k >= words.length) return null
    const name = basename(words[k])
    const args = words.slice(k + 1)
    const firstArg = args.find((arg) => !arg.startsWith("-"))
    const has = (...flags: string[]) => args.some((arg) => flags.includes(arg))

    if (hardWrite.has(name) || name.startsWith("mkfs")) return `"${name}" modifies files or system state`
    if (name === "tee") {
      const bad = args.filter((arg) => !arg.startsWith("-")).find((file) => !SAFE_TARGETS.has(file))
      return bad ? `tee writes to "${bad}"` : null
    }
    if (name === "sed" && args.some((arg) => /^-[a-zA-Z]*i/.test(arg) || arg.startsWith("--in-place"))) {
      return "sed -i edits files in place"
    }
    if (name === "perl" && args.some((arg) => /^-[a-zA-Z]*i/.test(arg))) return "perl -i edits files in place"
    if (SHELLS.has(name)) {
      const flag = args.findIndex((arg) => /^-[a-zA-Z]*c$/.test(arg))
      if (flag >= 0 && args[flag + 1] !== undefined) {
        const verdict = analyzeCommand(args[flag + 1], depth + 1)
        return verdict.block ? `${name} -c: ${verdict.reason}` : null
      }
      return null
    }
    if (name === "eval") {
      const verdict = analyzeCommand(args.join(" "), depth + 1)
      return verdict.block ? `eval: ${verdict.reason}` : null
    }
    if (name === "find") return findWrites(args, depth)
    if (name === "fd" || name === "fdfind") {
      const j = args.findIndex((arg) => ["-x", "--exec", "-X", "--exec-batch"].includes(arg))
      if (j < 0) return null
      const why = commandWrites(args.slice(j + 1), depth + 1)
      return why ? `fd ${args[j]}: ${why}` : null
    }
    if (name === "tree" && has("-o")) return "tree -o writes a file"
    if (name === "sort") return sortWrites(args, depth)
    if (name === "uniq") {
      const output = uniqOutput(args)
      if (output !== undefined && output !== "-" && !SAFE_TARGETS.has(output)) return "uniq INPUT OUTPUT writes a file"
    }
    if (name === "tar") {
      const first = args[0] ?? ""
      const shortMode = !first.startsWith("--") && /^-?[a-zA-Z]*[cxruA]/.test(first)
      const longMode = has("--create", "--extract", "--get", "--append", "--update", "--concatenate", "--delete")
      return shortMode || longMode ? "tar creates or extracts files" : null
    }
    if (name === "unzip" && !args.some((arg) => /^-[a-zA-Z]*[lvtZp]/.test(arg))) return "unzip extracts files"
    if (
      COMPRESSORS.has(name) &&
      !args.some((arg) => /^-[a-zA-Z]*[clt]/.test(arg) || ["--stdout", "--list", "--test"].includes(arg))
    ) {
      return `${name} rewrites files in place`
    }
    if (name === "7z" && firstArg && ["a", "x", "e", "d", "u", "rn"].includes(firstArg)) {
      return "7z modifies archives or extracts files"
    }
    if (name === "curl") return curlWrites(args)
    if (name === "wget") {
      const safe = args.some(
        (arg, j) =>
          arg === "--spider" ||
          arg === "-O-" ||
          arg === "-qO-" ||
          arg === "--output-document=-" ||
          arg === "--output-document=/dev/null" ||
          (/^-[a-zA-Z]*O$/.test(arg) && ["-", "/dev/null"].includes(args[j + 1] ?? "")),
      )
      return safe ? null : "wget downloads to a file (use -O - to print instead)"
    }
    if (name === "crontab" && !has("-l")) return "crontab modifies the crontab"
    if (name === "systemctl") {
      if (firstArg && !/^(status|show|cat|help|list-.*|is-.*)$/.test(firstArg)) {
        return `systemctl ${firstArg} changes system state`
      }
      return null
    }
    if (name === "journalctl" && args.some((arg) => /^--(vacuum|rotate|flush|sync|relinquish)/.test(arg))) {
      return "journalctl maintenance flags modify journals"
    }
    if (name === "git") return gitWrites(args)
    if (name === "herdr") return herdrWrites(args, depth)
    if (packageManagers.has(name)) {
      if ((name === "npm" && helpRequest(args, 1)) || (name === "mise" && helpRequest(args, 2))) return null
      if (firstArg && packageWrite.has(firstArg)) return `${name} ${firstArg} modifies dependencies or files`
      if (name === "go" && firstArg === "mod") {
        const sub = args[args.indexOf("mod") + 1] ?? ""
        if (["tidy", "edit", "vendor", "init", "download"].includes(sub)) return "go mod modifies module files"
      }
      if (name === "go" && firstArg === "build") return "go build writes binaries"
    }
    return null
  }

  /** `-o FILE` / `--output=FILE` (any abbreviation: `--o`, `--out`) write; `--compress-program=PROG` runs PROG. */
  function sortWrites(args: readonly string[], depth: number): string | null {
    for (let j = 0; j < args.length && args[j] !== "--"; j++) {
      const arg = args[j]
      if (arg.startsWith("--o") || /^-[a-zA-Z]*o/.test(arg)) return "sort -o writes a file"
      if (arg.startsWith("--co")) {
        const program = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : args[j + 1]
        // sort pipes its data through PROG and `PROG -d` without operands: a compressor only filters
        const why = program && !COMPRESSORS.has(basename(program)) ? commandWrites([program], depth + 1) : null
        if (why) return `sort --compress-program: ${why}`
      }
    }
    return null
  }

  function findWrites(args: readonly string[], depth: number): string | null {
    const bad = args.find((arg) => ["-delete", "-fprint", "-fprint0", "-fprintf", "-fls"].includes(arg))
    if (bad) return `find ${bad} deletes or writes files`
    for (let j = 0; j < args.length; j++) {
      if (!["-exec", "-execdir", "-ok", "-okdir"].includes(args[j])) continue
      const inner: string[] = []
      let e = j + 1
      while (e < args.length && args[e] !== ";" && args[e] !== "+") inner.push(args[e++])
      const why = commandWrites(inner, depth + 1)
      if (why) return `find ${args[j]}: ${why}`
      j = e
    }
    return null
  }

  /**
   * herdr commands that write files or run a program: the ones listed in `commands.herdr.write`, `api schema
   * --output`, and `pane run` when the command it types into the pane would itself be blocked. The rest of the
   * mutating herdr commands are not blocked but always ask (rules/ask.json).
   */
  function herdrWrites(args: readonly string[], depth: number): string | null {
    let j = 0
    while (j < args.length && args[j].startsWith("-")) {
      if (HERDR_OPTIONS_WITH_ARGUMENT.has(args[j++])) j++
    }
    const rest = args.slice(j)
    if (helpRequest(rest, 3)) return null
    const words: string[] = []
    for (const word of rest) {
      if (word.startsWith("-") || words.length === 3) break
      words.push(word)
    }
    for (let n = 1; n <= words.length; n++) {
      const path = words.slice(0, n).join(" ")
      if (herdrWrite.has(path)) return `herdr ${path} changes files, worktrees or the herdr installation`
    }
    const path = words.slice(0, 2).join(" ")
    if (path === "api schema" && rest.some((arg) => arg === "--output" || arg.startsWith("--output="))) {
      return "herdr api schema --output writes a file"
    }
    if (path === "pane run") {
      const afterRun = rest.slice(2)
      const pane = afterRun.findIndex((arg) => !arg.startsWith("-"))
      const inner = pane < 0 ? "" : afterRun.slice(pane + 1).join(" ")
      if (inner) {
        const verdict = analyzeCommand(inner, depth + 1)
        if (verdict.block) return `herdr pane run: ${verdict.reason}`
      }
    }
    return null
  }

  function gitWrites(args: readonly string[]): string | null {
    let j = 0
    while (j < args.length && args[j].startsWith("-")) {
      const option = args[j++]
      if (["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"].includes(option)) j++
    }
    const sub = args[j]
    const rest = args.slice(j + 1)
    if (!sub || helpRequest(args.slice(j), 1)) return null
    const has = (...flags: string[]) => rest.some((arg) => flags.includes(arg))
    const positional = rest.filter((arg) => !arg.startsWith("-"))
    const startsWithAny = (...prefixes: string[]) =>
      rest.some((arg) => prefixes.some((prefix) => arg.startsWith(prefix)))
    if (
      rest.some((arg) => arg === "--output" || arg.startsWith("--output=")) ||
      (sub === "archive" && rest.some((arg) => /^-[a-zA-Z]*o/.test(arg)))
    ) {
      return `git ${sub} --output writes a file`
    }
    if (gitWrite.has(sub)) return `git ${sub} modifies the repository or working tree`
    switch (sub) {
      case "stash":
        return rest[0] && ["list", "show"].includes(rest[0]) ? null : "git stash modifies the working tree"
      case "branch": {
        if (
          has("-d", "-D", "-m", "-M", "-c", "-C", "--delete", "--move", "--copy", "-f", "--force", "-u") ||
          has("--unset-upstream", "--edit-description", "-t", "--track") ||
          startsWithAny("--set-upstream-to")
        ) {
          return "git branch modifies branches"
        }
        const listing =
          has("-l", "--list", "-a", "--all", "-r", "--remotes", "-v", "-vv", "--verbose", "--contains") ||
          has("--no-contains", "--merged", "--no-merged", "--points-at", "--show-current") ||
          startsWithAny("--format", "--sort")
        return positional.length && !listing ? "git branch <name> creates a branch" : null
      }
      case "tag": {
        if (
          has("-d", "--delete", "-a", "--annotate", "-s", "--sign", "-u", "--local-user", "-f", "--force") ||
          has("-m", "--message", "-F", "--file", "-e", "--edit")
        ) {
          return "git tag modifies tags"
        }
        const listing =
          has("-l", "--list", "-n", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at") ||
          has("-v", "--verify") ||
          startsWithAny("--format", "--sort")
        return positional.length && !listing ? "git tag <name> creates a tag" : null
      }
      case "remote": {
        // `-v` may come before the subcommand (`git remote -v add …` adds a remote)
        const action = rest.find((arg) => !arg.startsWith("-"))
        return action && !["show", "get-url"].includes(action) ? `git remote ${action} modifies remotes` : null
      }
      case "config": {
        const writing =
          has("--unset", "--unset-all", "--add", "--replace-all", "--rename-section", "--remove-section", "-e") ||
          has("--edit") ||
          ["set", "unset", "rename-section", "remove-section", "edit"].includes(rest[0] ?? "")
        if (writing) return "git config modifies configuration"
        const reading =
          has("--get", "--get-all", "--get-regexp", "-l", "--list") || ["get", "list"].includes(rest[0] ?? "")
        return positional.length >= 2 && !reading ? "git config <key> <value> modifies configuration" : null
      }
      case "worktree":
        return rest[0] && rest[0] !== "list" ? `git worktree ${rest[0]} modifies worktrees` : null
      case "submodule":
        return rest[0] && !["status", "summary"].includes(rest[0])
          ? `git submodule ${rest[0]} modifies submodules`
          : null
      case "notes":
        return rest[0] && !["list", "show"].includes(rest[0]) ? `git notes ${rest[0]} modifies notes` : null
      case "reflog":
        return ["expire", "delete"].includes(rest[0] ?? "") ? "git reflog expire/delete modifies the reflog" : null
      case "symbolic-ref":
        return has("-d", "--delete") || positional.length >= 2 ? "git symbolic-ref modifies refs" : null
      case "hash-object":
        return has("-w") ? "git hash-object -w writes objects" : null
      default:
        return null
    }
  }

  const analyzer: Analyzer = { analyze: analyzeCommand, commandWrites }
  analyzers.set(commands, analyzer)
  return analyzer
}

/** Decide whether a command line modifies files or system state, using the shared command classification. */
export function analyze(command: string, commands?: Commands): Verdict {
  return createAnalyzer(commands).analyze(command)
}
