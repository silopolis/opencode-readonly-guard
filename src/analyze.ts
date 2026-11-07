import { basename } from "node:path"
import { createEnvironmentCheck, processEnvironment, type Environment } from "./environment.js"
import {
  containerWrites,
  ipWrites,
  journalctlWrites,
  lspciWrites,
  mountLists,
  pacmanWrites,
  systemctlWrites,
  virshWrites,
  xxdOutput,
} from "./programs.js"
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

/** Is `arg` one of the long options `names`, possibly abbreviated (`--edit-desc`), possibly with `=value`? */
function isLongOption(arg: string, names: readonly string[]): boolean {
  if (!arg.startsWith("--")) return false
  const name = arg.slice(2).split("=")[0]
  return name.length > 0 && names.some((full) => full.startsWith(name))
}

/** Is there a write option: a short one in a bundle (`-rd`), or a long one, abbreviated or not? */
function writesWith(args: readonly string[], shortLetters: string, longNames: readonly string[]): boolean {
  return args.some(
    (arg) =>
      (/^-[^-]/.test(arg) && Array.from(arg.slice(1)).some((letter) => shortLetters.includes(letter))) ||
      isLongOption(arg, longNames),
  )
}

const BRANCH_WRITE = [
  "delete",
  "move",
  "copy",
  "force",
  "set-upstream-to",
  "set-upstream",
  "unset-upstream",
  "edit-description",
  "track",
  "no-track",
  "create-reflog",
  "recurse-submodules",
]
const TAG_WRITE = [
  "delete",
  "annotate",
  "sign",
  "no-sign",
  "local-user",
  "force",
  "message",
  "file",
  "edit",
  "cleanup",
  "create-reflog",
  "trailer",
]

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

/** GNU date's options. Long options may be abbreviated to any unambiguous prefix (`--se` is `--set`). */
const DATE_LONG = [
  "date",
  "debug",
  "file",
  "iso-8601",
  "resolution",
  "rfc-email",
  "rfc-3339",
  "reference",
  "set",
  "utc",
  "universal",
  "help",
  "version",
]
const DATE_LONG_WITH_VALUE = new Set(["date", "file", "reference", "rfc-3339", "set"])
const DATE_SHORT_WITH_VALUE = new Set(["d", "f", "r", "s"])

/** Does `date` set the clock: `-s`/`--set`, or an operand that is not a `+FORMAT` (`date MMDDhhmm`)? */
function dateSets(args: readonly string[]): boolean {
  for (let j = 0; j < args.length; j++) {
    const arg = args[j]
    if (arg === "--") return args.slice(j + 1).some((operand) => !operand.startsWith("+"))
    if (arg === "-" || !arg.startsWith("-")) {
      if (!arg.startsWith("+")) return true
    } else if (arg.startsWith("--")) {
      const [name, value] = arg.slice(2).split(/=(.*)/s)
      const matches = DATE_LONG.filter((option) => option.startsWith(name))
      const option = DATE_LONG.includes(name) ? name : matches.length === 1 ? matches[0] : undefined
      if (option === "set") return true
      if (option && value === undefined && DATE_LONG_WITH_VALUE.has(option)) j++
    } else {
      for (let c = 1; c < arg.length; c++) {
        const letter = arg[c]
        if (letter === "s") return true
        if (letter === "I") break // -I[FMT]: an optional value, attached
        if (DATE_SHORT_WITH_VALUE.has(letter)) {
          if (c === arg.length - 1) j++
          break
        }
      }
    }
  }
  return false
}

/** `hostname NAME`, `-F FILE`/`--file FILE` and `-b`/`--boot` set the host name; the other options print it. */
function hostnameSets(args: readonly string[]): boolean {
  return args.some((arg) => {
    if (!arg.startsWith("-")) return true
    if (!arg.startsWith("--")) return /[Fb]/.test(arg.slice(1))
    const name = arg.slice(2).split("=")[0]
    return (name.length >= 2 && "file".startsWith(name)) || (name.length >= 1 && "boot".startsWith(name))
  })
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

/**
 * Build an analyzer for a command classification. The default one, which reads the plugin's own environment to know
 * which variables are exported, is cached per classification; one built for another environment is not.
 */
export function createAnalyzer(commands: Commands = loadRules().commands, environment?: Environment): Analyzer {
  const existing = environment ? undefined : analyzers.get(commands)
  if (existing) return existing

  const hardWrite = new Set(commands.hardWrite)
  const packageManagers = new Set(commands.packageManagers.names)
  const packageWrite = new Set(commands.packageManagers.writeSubcommands)
  const gitWrite = new Set(commands.git.write)
  const herdrWrite = new Set(commands.herdr.write)
  const containerNames = new Set(commands.containers.names)
  const containerWrite = new Set(commands.containers.write)
  const environmentWrites = createEnvironmentCheck(commands.environment, environment ?? processEnvironment)

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
    const exported = environmentWrites(words, k, KEYWORDS)
    if (exported) return exported
    if (k >= words.length) return null
    const name = basename(words[k])
    const args = words.slice(k + 1)
    const firstArg = args.find((arg) => !arg.startsWith("-"))
    const has = (...flags: string[]) => args.some((arg) => flags.includes(arg))

    if (name === "mount" && mountLists(args)) return null
    if (hardWrite.has(name) || name.startsWith("mkfs")) return `"${name}" modifies files or system state`
    if (name === "ip") return ipWrites(args, (inner) => commandWrites(inner, depth + 1))
    if (name === "pacman") return pacmanWrites(args)
    if (containerNames.has(name)) return containerWrites(name, args, containerWrite)
    if (name === "virsh") return virshWrites(args)
    if (name === "lspci") return lspciWrites(args)
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
    if (name === "date" && dateSets(args)) return "date -s/--set or a MMDDhhmm operand sets the system clock"
    if (name === "hostname" && hostnameSets(args)) return "hostname NAME, -F or -b sets the host name"
    if (name === "uniq") {
      const output = uniqOutput(args)
      if (output !== undefined && output !== "-" && !SAFE_TARGETS.has(output)) return "uniq INPUT OUTPUT writes a file"
    }
    if (name === "xxd") {
      const output = xxdOutput(args)
      if (output !== undefined && output !== "-" && !SAFE_TARGETS.has(output)) return "xxd INFILE OUTFILE writes a file"
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
    if (name === "systemctl") return systemctlWrites(args)
    if (name === "journalctl") return journalctlWrites(args)
    if (name === "git") return gitWrites(args, depth)
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

  /**
   * `git grep -O[PAGER]` / `--open-files-in-pager[=PAGER]` runs PAGER through the shell on the matching files. The
   * ask rules see `-O` written apart; in a bundle (`-nO`) they cannot, so it is blocked. A PAGER that writes is
   * blocked too.
   */
  function grepPager(args: readonly string[], depth: number): string | null {
    const pager = (command: string) => {
      const verdict = analyzeCommand(command, depth + 1)
      return verdict.block ? `git grep -O runs a pager command: ${verdict.reason}` : null
    }
    for (let j = 0; j < args.length; j++) {
      const arg = args[j]
      if (arg === "--") break
      if (arg.startsWith("--")) {
        const [name, value] = arg.slice(2).split(/=(.*)/s)
        if (name.length >= 2 && "open-files-in-pager".startsWith(name) && value) {
          const why = pager(value)
          if (why) return why
        }
        continue
      }
      for (let c = 1; c < arg.length; c++) {
        const letter = arg[c]
        if (letter === "O") {
          if (c > 1) return "git grep -O in a bundle: write -O apart so it asks"
          const why = arg.length > 2 ? pager(arg.slice(2)) : null
          if (why) return why
          break
        }
        if ("ABCefm".includes(letter)) {
          if (c === arg.length - 1) j++ // the value is the next word
          break
        }
        if (/\d/.test(letter)) break // -3: context lines
      }
    }
    return null
  }

  function gitWrites(args: readonly string[], depth: number): string | null {
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
      // Only the flags below switch to list mode (or make git refuse a name). -v, --sort, --format, --color, …
      // do not: `git branch -v NAME` and `git tag --sort=x NAME` create a ref. Write options count in any
      // abbreviation git accepts (`--edit-desc`) and in bundles (`-rd`, `-uorigin/main`).
      case "branch": {
        if (writesWith(rest, "dDmMcCfut", BRANCH_WRITE)) return "git branch modifies branches"
        const listing =
          has("-l", "--list", "-a", "--all", "-r", "--remotes", "--show-current") ||
          startsWithAny("--contains", "--no-contains", "--merged", "--no-merged", "--points-at")
        return positional.length && !listing ? "git branch <name> creates a branch" : null
      }
      case "tag": {
        if (writesWith(rest, "dasufmFe", TAG_WRITE)) return "git tag modifies tags"
        const listing =
          has("-l", "--list", "-v", "--verify") ||
          rest.some((arg) => /^-n\d*$/.test(arg)) ||
          startsWithAny("--contains", "--no-contains", "--merged", "--no-merged", "--points-at")
        return positional.length && !listing ? "git tag <name> creates a tag" : null
      }
      case "ls-remote":
        for (let k = 0; k < rest.length; k++) {
          if (!isLongOption(rest[k], ["upload-pack", "exec"])) continue
          const arg = rest[k]
          const program = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : (rest[k + 1] ?? "")
          const verdict = analyzeCommand(program, depth + 1)
          if (verdict.block) return `git ls-remote --upload-pack runs a command: ${verdict.reason}`
        }
        return null
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
        // -t takes a value: `-tw` is type "w", `-wt blob` writes
        return rest.some((arg) => /^-[^-t]*w/.test(arg)) ? "git hash-object -w writes objects" : null
      case "grep":
        return grepPager(rest, depth)
      default:
        return null
    }
  }

  const analyzer: Analyzer = { analyze: analyzeCommand, commandWrites }
  if (!environment) analyzers.set(commands, analyzer)
  return analyzer
}

/** Decide whether a command line modifies files or system state, using the shared command classification. */
export function analyze(command: string, commands?: Commands): Verdict {
  return createAnalyzer(commands).analyze(command)
}
