/**
 * Argument parsers for system tools whose writes depend on their arguments (systemctl, journalctl, …). Each
 * function returns why the command writes, or null. They follow the program's own option parsing (getopt
 * abbreviations, bundled short options, options that take a value) closely enough that a write cannot hide
 * behind an unusual spelling; when in doubt they report a write.
 */

/** Long options that are a proper prefix of one of `names` (`--ho` for `--host`): getopt accepts them. */
const abbreviates = (name: string, names: readonly string[]): boolean =>
  name.length > 0 && names.some((full) => full !== name && full.startsWith(name))

const SYSTEMCTL_READ = /^(status|show|cat|help|list-[a-z-]+|is-[a-z-]+|show-environment|get-default)$/
/** Short options of systemctl that take a value (`-t TYPE`, `-tTYPE`). */
const SYSTEMCTL_SHORT_WITH_VALUE = "CHMtpPsno"
const SYSTEMCTL_LONG_WITH_VALUE = new Set([
  "boot-loader-entry",
  "boot-loader-menu",
  "capsule",
  "check-inhibitors",
  "drop-in",
  "host",
  "image",
  "image-policy",
  "job-mode",
  "kernel-cmdline",
  "kill-subgroup",
  "kill-value",
  "kill-whom",
  "legend",
  "lines",
  "machine",
  "message",
  "output",
  "preset-mode",
  "property",
  "reboot-argument",
  "root",
  "signal",
  "state",
  "timestamp",
  "type",
  "what",
  "when",
])
/** The options that send systemctl to another host or container; they ask (rules/ask.json) when written apart. */
const SYSTEMCTL_REMOTE = ["host", "machine"]

/**
 * systemctl changes state unless its verb is a read (`status`, `show`, `list-*`, `is-*`, …). The verb is the first
 * word that is not an option or an option's value. `-H`/`-M` must be written apart (`-H HOST`, `--host=HOST`): in a
 * bundle (`-aH`) or abbreviated (`--ho`) the ask rules cannot see them.
 */
export function systemctlWrites(args: readonly string[]): string | null {
  let verb: string | undefined
  for (let j = 0; j < args.length; j++) {
    const arg = args[j]
    if (arg === "--") {
      verb ??= args[j + 1]
      break
    }
    if (arg.startsWith("--")) {
      const [name, value] = arg.slice(2).split(/=(.*)/s)
      if (abbreviates(name, SYSTEMCTL_REMOTE)) {
        return "systemctl --host/--machine abbreviated: write -H HOST or --host=HOST as a separate option so it asks"
      }
      if (value === undefined && SYSTEMCTL_LONG_WITH_VALUE.has(name)) j++
    } else if (arg.length > 1 && arg.startsWith("-")) {
      for (let c = 1; c < arg.length; c++) {
        const letter = arg[c]
        if ((letter === "H" || letter === "M") && c > 1) {
          return `systemctl -${letter} in a bundle: write -${letter} as a separate option so it asks`
        }
        if (SYSTEMCTL_SHORT_WITH_VALUE.includes(letter)) {
          if (c === arg.length - 1) j++
          break
        }
      }
    } else {
      verb ??= arg
    }
  }
  return verb && !SYSTEMCTL_READ.test(verb) ? `systemctl ${verb} changes system state` : null
}

/** Every long option of journalctl (systemd 262), to resolve getopt abbreviations. */
const JOURNALCTL_LONG = [
  "after-cursor",
  "all",
  "boot",
  "case-sensitive",
  "catalog",
  "cursor",
  "cursor-file",
  "directory",
  "disk-usage",
  "dmesg",
  "dump-catalog",
  "exclude-identifier",
  "facility",
  "field",
  "fields",
  "file",
  "flush",
  "follow",
  "force",
  "grep",
  "header",
  "help",
  "identifier",
  "image",
  "image-policy",
  "interval",
  "invocation",
  "lines",
  "list-boots",
  "list-catalog",
  "list-invocations",
  "list-namespaces",
  "machine",
  "merge",
  "namespace",
  "new-id128",
  "no-full",
  "no-hostname",
  "no-pager",
  "no-tail",
  "output",
  "output-fields",
  "pager-end",
  "priority",
  "quiet",
  "relinquish-var",
  "reverse",
  "root",
  "rotate",
  "setup-keys",
  "show-cursor",
  "since",
  "smart-relinquish-var",
  "sync",
  "synchronize-on-exit",
  "system",
  "truncate-newline",
  "unit",
  "until",
  "update-catalog",
  "user",
  "user-unit",
  "utc",
  "vacuum-files",
  "vacuum-size",
  "vacuum-time",
  "verify",
  "verify-key",
  "version",
]
/** journalctl options that write journal files, keys, the catalog or a cursor file, or make journald do so. */
const JOURNALCTL_WRITES = [
  "cursor-file",
  "flush",
  "relinquish-var",
  "rotate",
  "setup-keys",
  "smart-relinquish-var",
  "sync",
  "synchronize-on-exit",
  "update-catalog",
  "vacuum-files",
  "vacuum-size",
  "vacuum-time",
]

/**
 * journalctl only reads, except for its maintenance options. getopt accepts any unambiguous prefix (`--rot` is
 * `--rotate`), and an ambiguous one is an error, so any prefix of a maintenance option counts as one.
 */
export function journalctlWrites(args: readonly string[]): string | null {
  for (const arg of args) {
    if (arg === "--") break
    if (!arg.startsWith("--")) continue
    const name = arg.slice(2).split("=")[0]
    const writes = JOURNALCTL_LONG.includes(name)
      ? JOURNALCTL_WRITES.includes(name)
      : JOURNALCTL_WRITES.some((option) => option.startsWith(name))
    if (name && writes) return `journalctl --${name} writes or maintains journal files`
  }
  return null
}
