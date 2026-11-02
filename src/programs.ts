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

/** `mount`, `mount -l`, `mount [-l] -t TYPE`: the listing forms of mount(8). Anything else mounts or remounts. */
export function mountLists(args: readonly string[]): boolean {
  const rest = args.filter((arg) => arg !== "-l")
  if (rest.length === 0) return true
  return rest.length === 2 && (rest[0] === "-t" || rest[0] === "--types") && !rest[1].startsWith("-")
}

/** iproute2's `matches()`: a non-empty prefix of the keyword. */
const matches = (word: string, keyword: string): boolean => word.length > 0 && keyword.startsWith(word)

/** ip's global options in the order ip.c tries them (each may be abbreviated), and whether they take a value. */
const IP_OPTIONS: readonly (readonly [name: string, kind: "value" | "flag" | "exact" | "batch"])[] = [
  ["-loops", "value"],
  ["-family", "value"],
  ["-4", "exact"],
  ["-6", "exact"],
  ["-0", "exact"],
  ["-M", "exact"],
  ["-B", "exact"],
  ["-human-readable", "flag"],
  ["-iec", "flag"],
  ["-stats", "flag"],
  ["-statistics", "flag"],
  ["-details", "flag"],
  ["-resolve", "flag"],
  ["-oneline", "flag"],
  ["-timestamp", "flag"],
  ["-tshort", "flag"],
  ["-Version", "flag"],
  ["-force", "flag"],
  ["-batch", "batch"],
  ["-brief", "flag"],
  ["-json", "flag"],
  ["-pretty", "flag"],
  ["-rcvbuf", "value"],
  ["-color", "flag"],
  ["-help", "flag"],
  ["-netns", "value"],
  ["-Numeric", "flag"],
  ["-all", "flag"],
  ["-echo", "exact"],
]
/** ip's objects in the order ip.c tries them: `ip a` is `address`, `ip l` is `link`, `ip r` is `route`. */
const IP_OBJECTS = [
  "address",
  "addrlabel",
  "maddress",
  "route",
  "rule",
  "neighbor",
  "neighbour",
  "ntable",
  "ntbl",
  "link",
  "l2tp",
  "fou",
  "ila",
  "macsec",
  "tunnel",
  "tunl",
  "tuntap",
  "tap",
  "token",
  "tcpmetrics",
  "tcp_metrics",
  "monitor",
  "xfrm",
  "mroute",
  "mrule",
  "netns",
  "netconf",
  "vrf",
  "sr",
  "nexthop",
  "mptcp",
  "ioam",
  "help",
  "stats",
]
/**
 * The verbs of the objects the allowlist names, in the order iproute2 tries them (ipaddress.c, iplink.c, iproute.c,
 * ipneigh.c), and whether they write. `ip link s` is `set` and `ip a s` is `show` because of that order.
 */
const IP_VERBS: Readonly<Record<string, readonly (readonly [verb: string, writes: boolean])[]>> = {
  address: [
    ["add", true],
    ["change", true],
    ["replace", true],
    ["delete", true],
    ["list", false],
    ["show", false],
    ["lst", false],
    ["flush", true],
    ["save", false],
    ["showdump", false],
    ["restore", true],
    ["help", false],
  ],
  link: [
    ["add", true],
    ["set", true],
    ["change", true],
    ["replace", true],
    ["delete", true],
    ["show", false],
    ["lst", false],
    ["list", false],
    ["xstats", false],
    ["afstats", false],
    ["property", true],
    ["help", false],
  ],
  route: [
    ["add", true],
    ["change", true],
    ["replace", true],
    ["prepend", true],
    ["append", true],
    ["test", true],
    ["delete", true],
    ["list", false],
    ["show", false],
    ["lst", false],
    ["get", false],
    ["flush", true],
    ["save", false],
    ["restore", true],
    ["showdump", false],
    ["help", false],
  ],
  neighbor: [
    ["add", true],
    ["change", true],
    ["replace", true],
    ["delete", true],
    ["get", false],
    ["show", false],
    ["lst", false],
    ["list", false],
    ["flush", true],
    ["help", false],
  ],
}
/** `ip netns` verbs that change namespaces (any prefix: `a` is add or attach, both write). */
const IP_NETNS_WRITES = ["add", "attach", "set", "delete"]

/**
 * ip (iproute2) writes with `add`, `set`, `delete`, `flush`, … after an object, which iproute2 lets the user
 * abbreviate down to one letter, resolved in its own order. `-batch FILE` runs a file of commands, and
 * `netns exec` / `vrf exec` run a command, judged by `inner`.
 */
export function ipWrites(args: readonly string[], inner: (words: readonly string[]) => string | null): string | null {
  let j = 0
  for (; j < args.length && args[j].startsWith("-"); j++) {
    const arg = args[j]
    if (arg === "--") {
      j++
      break
    }
    // only -color takes an attached value (`-color=always`, `-c=never`)
    const color = arg.includes("=") && matches(arg.slice(0, arg.indexOf("=")), "-color")
    const option = color
      ? IP_OPTIONS.find(([name]) => name === "-color")
      : IP_OPTIONS.find(([name, kind]) => (kind === "exact" ? arg === name : matches(arg, name)))
    if (!option) return null // ip refuses an unknown option
    if (option[1] === "batch") return "ip -batch runs the commands of a file, which the guard cannot see"
    if (option[1] === "value") j++
  }
  const word = args[j]
  if (!word) return null
  const object = IP_OBJECTS.find((name) => matches(word, name))
  const verb = args[j + 1] ?? ""
  if (object === "netns" || object === "vrf") {
    if (matches(verb, "exec")) {
      const why = inner(args.slice(j + 3))
      return why ? `ip ${object} exec: ${why}` : null
    }
    return object === "netns" && IP_NETNS_WRITES.some((name) => matches(verb, name))
      ? `ip netns ${verb} changes network namespaces`
      : null
  }
  const verbs = IP_VERBS[object === "neighbour" ? "neighbor" : (object ?? "")]
  if (!verbs || !verb) return null
  const resolved = verb === "chg" ? (["change", true] as const) : verbs.find(([name]) => matches(verb, name))
  return resolved?.[1] ? `ip ${object} ${resolved[0]} changes the network configuration` : null
}

/** Global options of docker and podman that take a value (they come before the subcommand). */
const CONTAINER_OPTIONS_WITH_VALUE = new Set([
  // docker
  "-c",
  "--context",
  "--config",
  "-H",
  "--host",
  "-l",
  "--log-level",
  "--tlscacert",
  "--tlscert",
  "--tlskey",
  // podman
  "--cdi-spec-dir",
  "--cgroup-manager",
  "--conmon",
  "--connection",
  "--events-backend",
  "--hooks-dir",
  "--identity",
  "--imagestore",
  "--module",
  "--network-cmd-path",
  "--network-config-dir",
  "--out",
  "--root",
  "--runroot",
  "--runtime",
  "--runtime-flag",
  "--ssh",
  "--storage-driver",
  "--storage-opt",
  "--tls-ca",
  "--tls-cert",
  "--tls-key",
  "--tmpdir",
  "--url",
  "--volumepath",
])
const NULL_TARGETS = new Set(["-", "/dev/null", "/dev/stdout"])

/** Where `-o FILE`, `-oFILE`, `--output FILE` or `--output=FILE` points, if anywhere. */
function outputTarget(args: readonly string[]): string | undefined {
  for (let j = 0; j < args.length; j++) {
    const arg = args[j]
    if (arg === "-o" || arg === "--output") return args[j + 1] ?? ""
    if (arg.startsWith("--output=")) return arg.slice("--output=".length)
    if (/^-o./.test(arg)) return arg.slice(2).replace(/^=/, "")
  }
  return undefined
}

/**
 * docker and podman change containers, images, volumes, networks, contexts or files with the subcommand paths of
 * `commands.json` → `containers.write` (one or two words after the global options), `save`/`export -o FILE`, and
 * podman's global `--out FILE`.
 */
export function containerWrites(name: string, args: readonly string[], write: ReadonlySet<string>): string | null {
  let j = 0
  for (; j < args.length && args[j].startsWith("-"); j++) {
    const [option, value] = args[j].split(/=(.*)/s)
    if (option === "--out") {
      const target = value ?? args[j + 1] ?? ""
      if (!NULL_TARGETS.has(target)) return `${name} --out writes its output to a file`
    }
    if (value === undefined && CONTAINER_OPTIONS_WITH_VALUE.has(option)) j++
  }
  const [first, second] = [args[j], args[j + 1]]
  if (!first) return null
  const path = second && !second.startsWith("-") && write.has(`${first} ${second}`) ? `${first} ${second}` : first
  if (write.has(path)) return `${name} ${path} changes containers, images, volumes, networks or files`
  const rest = args.slice(j + 1)
  if ((first === "save" || first === "export" || second === "save" || second === "export") && rest.length) {
    const target = outputTarget(rest)
    if (target !== undefined && !NULL_TARGETS.has(target)) return `${name} save/export -o writes a file`
  }
  return null
}

/** pacman's operations, long and short. */
const PACMAN_OPERATIONS: Readonly<Record<string, string>> = {
  database: "D",
  query: "Q",
  remove: "R",
  sync: "S",
  deptest: "T",
  upgrade: "U",
  files: "F",
  version: "V",
  help: "h",
}
/** The long options pacman 7 knows (pacman.8), to resolve getopt abbreviations, with their short letter if any. */
const PACMAN_LONG: Readonly<Record<string, string>> = {
  ...PACMAN_OPERATIONS,
  dbpath: "b",
  root: "r",
  verbose: "v",
  arch: "",
  cachedir: "",
  color: "",
  config: "",
  debug: "",
  gpgdir: "",
  hookdir: "",
  logfile: "",
  noconfirm: "",
  confirm: "",
  "disable-download-timeout": "",
  sysroot: "",
  "disable-sandbox": "",
  "disable-sandbox-filesystem": "",
  "disable-sandbox-syscalls": "",
  nodeps: "d",
  "assume-installed": "",
  dbonly: "",
  noprogressbar: "",
  noscriptlet: "",
  print: "p",
  "print-format": "p",
  downloadonly: "w",
  asdeps: "",
  asexplicit: "",
  ignore: "",
  ignoregroup: "",
  needed: "",
  overwrite: "",
  changelog: "c",
  deps: "d",
  explicit: "e",
  groups: "g",
  info: "i",
  check: "k",
  list: "l",
  foreign: "m",
  native: "n",
  owns: "o",
  file: "p",
  quiet: "q",
  search: "s",
  unrequired: "t",
  upgrades: "u",
  cascade: "c",
  nosave: "n",
  recursive: "s",
  unneeded: "u",
  clean: "c",
  sysupgrade: "u",
  refresh: "y",
  regex: "x",
  machinereadable: "",
}

/**
 * pacman writes with -R, -U, -S unless it only searches or prints (-Ss, -Si, -Sl, -Sg, -Sp, and never with
 * -y/-u/-c/-w), -D --asdeps/--asexplicit and -Fy. Long options may be abbreviated (`--rem`). pacman refuses two
 * operations, but the guard still blocks if any of them writes.
 */
export function pacmanWrites(args: readonly string[]): string | null {
  const operations = new Set<string>()
  const flags = new Set<string>()
  const longs = new Set<string>()
  for (let j = 0; j < args.length; j++) {
    const arg = args[j]
    if (arg === "--") break
    if (arg.startsWith("--")) {
      const name = arg.slice(2).split("=")[0]
      const known = Object.keys(PACMAN_LONG)
      const candidates = known.includes(name) ? [name] : known.filter((option) => matches(name, option))
      // an ambiguous abbreviation is an error, except that it may still name an operation: assume the worst
      for (const option of candidates) {
        longs.add(option)
        const letter = PACMAN_LONG[option]
        if (option in PACMAN_OPERATIONS) operations.add(letter)
        else if (letter) flags.add(letter)
      }
    } else if (arg.length > 1 && arg.startsWith("-")) {
      for (let c = 1; c < arg.length; c++) {
        const letter = arg[c]
        if (letter === "b" || letter === "r") {
          if (c === arg.length - 1) j++ // --dbpath / --root take a value
          break
        }
        if ("DQRSTUFV".includes(letter)) operations.add(letter)
        else flags.add(letter)
      }
    }
  }
  if (operations.has("R")) return "pacman -R removes packages"
  if (operations.has("U")) return "pacman -U installs packages"
  if (operations.has("S")) {
    const changes = ["y", "u", "c", "w"].some((flag) => flags.has(flag))
    const readOnly = ["s", "i", "l", "g", "p"].some((flag) => flags.has(flag))
    if (changes || !readOnly) return "pacman -S installs, upgrades, downloads or cleans packages"
  }
  if (operations.has("D") && (longs.has("asdeps") || longs.has("asexplicit"))) {
    return "pacman -D --asdeps/--asexplicit changes the package database"
  }
  if (operations.has("F") && flags.has("y")) return "pacman -Fy downloads the file databases"
  return null
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
