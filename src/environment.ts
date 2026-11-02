/**
 * Statements that hand variables to the commands that follow them: `export`, `declare -x` and their relatives,
 * allexport and keyword mode, namerefs, and a new value for a variable that is already exported. opencode builds no
 * permission pattern for declarations or bare assignments, so they never prompt: the write guard is the only check
 * on them. A variable set for a single command (`NAME=value command`) is part of that command's text and asks.
 */

/** What the analyzer knows about the shell that will run the command. */
export interface Environment {
  /** Is this variable exported? The plugin's own environment is what opencode passes to the shell. */
  exported(name: string): boolean
}

export const processEnvironment: Environment = { exported: (name) => Object.hasOwn(process.env, name) }

/** `commands.json` → `environment`. */
export interface EnvironmentRules {
  /** Variables that only select a language, a format or turn a behaviour off: they may be exported. `LC_*` is a prefix. */
  exportSafe: readonly string[]
  /** Treated as exported even when the plugin's environment lacks them (PATH, HOME, zsh's `path` array). */
  alwaysExported: readonly string[]
}

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)(\[[^\]]*\])?\+?=(.*)$/s
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/
/** POSIX special builtins: in a POSIX shell (sh, dash) an assignment in front of one stays in effect afterwards. */
const SPECIAL_BUILTINS = new Set([
  ":",
  ".",
  "break",
  "continue",
  "eval",
  "exec",
  "exit",
  "export",
  "readonly",
  "return",
  "set",
  "shift",
  "source",
  "times",
  "trap",
  "unset",
])
const DECLARATIONS = new Set(["declare", "typeset", "local", "readonly", "integer", "float"])
/** Builtins that store input in the variables they name. */
const READERS = new Set(["read", "mapfile", "readarray", "getopts"])
/** Shell options that pass assignments to later commands: allexport (every assignment), keyword (arguments too). */
const EXPORTING_OPTIONS = new Set(["allexport", "keyword"])
const EXPORTING_LETTERS = /[ak]/

/** The variable an argument names: `PATH[0]=x` → PATH, `x+=y` → x, `name?prompt` (zsh read) → name. */
const variableOf = (arg: string): string => arg.replace(/[[+=?].*$/s, "")

/** zsh and bash option names, case-insensitive, underscores ignored: `ALL_EXPORT` is `allexport`. */
const optionName = (name: string): string => name.toLowerCase().replaceAll("_", "")

const LATER = "later commands"

const exporting = (name: string) =>
  `exporting ${name} hands it to ${LATER}, which can change what they run; set it for one command instead (${name}=value command), which asks`
const assigning = (name: string) =>
  `a new value for ${name} reaches ${LATER}, which inherit it from the environment; set it for one command instead (${name}=value command), which asks`

/** zsh's setopt / unsetopt: option names (a `no` prefix inverts them), single letters, `-m PATTERN`. */
function zshOptions(name: string, args: readonly string[]): string | null {
  for (const arg of args) {
    if (/^-[A-Za-z]+$/.test(arg)) {
      if (arg.includes("m"))
        return `${name} -m sets options by pattern, allexport included, which passes assignments to ${LATER}`
      if (name === "setopt" && EXPORTING_LETTERS.test(arg.slice(1)))
        return `setopt ${arg} passes assignments to ${LATER}`
      continue
    }
    const option = optionName(arg)
    const on = name === "setopt" ? option : option.startsWith("no") ? option.slice(2) : `no${option}`
    if (EXPORTING_OPTIONS.has(on)) return `${name} ${arg} passes assignments to ${LATER}`
  }
  return null
}

export function createEnvironmentCheck(rules: EnvironmentRules, environment: Environment) {
  const alwaysExported = new Set(rules.alwaysExported)
  const safe = (name: string): boolean =>
    rules.exportSafe.some((entry) => (entry.endsWith("*") ? name.startsWith(entry.slice(0, -1)) : name === entry))
  /** A new value for this variable reaches later commands, because it is (or is always) exported. */
  const sensitive = (name: string): boolean => !safe(name) && (alwaysExported.has(name) || environment.exported(name))

  function declaration(name: string, args: readonly string[]): string | null {
    let exportMode = name === "export"
    let unexport = false
    let functions = false
    const names: string[] = []
    let options = true
    for (const arg of args) {
      if (options && arg === "--") {
        options = false
      } else if (options && /^-[A-Za-z]+$/.test(arg)) {
        const letters = arg.slice(1)
        if (name !== "export" && letters.includes("n")) {
          return `${name} -n creates a reference through which an assignment can change variables that ${LATER} inherit`
        }
        if (letters.includes("x") || letters.includes("T")) exportMode = true
        if (name === "export" && letters.includes("n")) unexport = true
        if (name === "export" && letters.includes("f")) functions = true
      } else if (!(options && arg.startsWith("+"))) {
        names.push(arg)
      }
    }
    if (unexport) return null
    if (functions && names.length) return `export -f hands shell functions to ${LATER}`
    for (const arg of names) {
      const variable = variableOf(arg)
      if (exportMode && !safe(variable)) return exporting(variable)
      if (arg.includes("=") && sensitive(variable)) return assigning(variable)
    }
    return null
  }

  /** `set -a`, `set -o allexport`, `set -k`, zsh's `set -A NAME` (an array assignment). */
  function setOptions(args: readonly string[]): string | null {
    for (let j = 0; j < args.length; j++) {
      const arg = args[j]
      if (arg === "--" || arg === "-" || !/^[-+][A-Za-z]+$/.test(arg)) break
      if (arg.startsWith("+")) {
        if (arg.endsWith("o") || arg.endsWith("A")) j++
        continue
      }
      const letters = arg.slice(1)
      if (EXPORTING_LETTERS.test(letters)) return `set -${letters} passes assignments to ${LATER}`
      if (letters.endsWith("o") && EXPORTING_OPTIONS.has(optionName(args[j + 1] ?? ""))) {
        return `set -o ${args[j + 1]} passes assignments to ${LATER}`
      }
      if (letters.endsWith("A") && sensitive(args[j + 1] ?? "")) return assigning(args[j + 1])
      if (letters.endsWith("o") || letters.endsWith("A")) j++
    }
    return null
  }

  /**
   * Why this simple command hands variables to later commands, or null. `start` is the index of its command word
   * (after keywords, assignments and wrappers), `words.length` when there is none.
   */
  return function environmentWrites(
    words: readonly string[],
    start: number,
    keywords: ReadonlySet<string>,
  ): string | null {
    // Leading assignments persist when nothing follows them, before a POSIX special builtin, or for an array.
    const assignments: string[] = []
    let i = 0
    for (; i < words.length; i++) {
      const word = words[i]
      if ((word === "for" || word === "select") && IDENTIFIER.test(words[i + 1] ?? "")) {
        return sensitive(words[i + 1]) ? assigning(words[i + 1]) : null
      }
      if (keywords.has(word)) continue
      if (!ASSIGNMENT.test(word)) break
      assignments.push(word)
    }
    const array = assignments.some((word) => ASSIGNMENT.exec(word)?.[3].startsWith("("))
    if (i >= words.length || array || SPECIAL_BUILTINS.has(words[i])) {
      const variable = assignments.map(variableOf).find(sensitive)
      if (variable) return assigning(variable)
    }
    if (start >= words.length) return null

    const name = words[start].replace(/^.*\//, "")
    const args = words.slice(start + 1)
    if (name === "export" || DECLARATIONS.has(name)) return declaration(name, args)
    if (name === "set") return setOptions(args)
    if (name === "setopt" || name === "unsetopt") return zshOptions(name, args)
    if (name === "printf") {
      for (let j = 0; j < args.length && args[j].startsWith("-") && args[j] !== "--"; j++) {
        const target = args[j] === "-v" ? args[j + 1] : args[j].startsWith("-v") ? args[j].slice(2) : undefined
        if (target && sensitive(variableOf(target))) return assigning(variableOf(target))
      }
      return null
    }
    if (READERS.has(name)) {
      const variable = args.map(variableOf).find((arg) => IDENTIFIER.test(arg) && sensitive(arg))
      return variable ? assigning(variable) : null
    }
    return null
  }
}
