# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Write guard for read-only agents (`plan`, `explore`, agents with `edit: deny`): blocks write redirections in any
  position, `tee` to files, file-modifying commands, `sed -i`, mutating git and package-manager commands and more,
  including behind wrappers and command substitutions.
- Shared, community-extensible rules in `rules/` (allowlist, always-ask flags, command classification, expected
  verdicts) with JSON Schemas.
- Event log of commands, blocks, prompts and answers for read-only agents.
- Reviewed learning: "always" answers become candidates; `/guard-review` and the `readonly_guard_review` /
  `readonly_guard_update` tools add vetted rules after an explicit confirmation of the exact pattern.
- `opencode-readonly-guard` command-line tool: `check`, `vet`, `rules`, `review`, `install`.
- Plugin options (`agents`, `allow`, `store`, `logDir`, `toast`, `command`).
- herdr rules: read-only `herdr` commands (`agent list`, `pane read`, `status`, …) are allowed in read-only agents;
  every other subcommand always asks and cannot be learned; `update`, `worktree create|remove`,
  `integration install|uninstall`, `session delete`, `plugin install|update`, `api schema --output` and `pane run` of a
  writing command are blocked.
- The `herdr-ui` preset: `herdr tab rename` and `herdr notification show`, which only change what herdr displays, are
  allowed when opencode runs in a herdr pane (`HERDR_ENV=1`) and not elsewhere. Switch it off with
  `"presets": { "herdr-ui": false }` in the plugin options, the store or herdr's own `readonly-guard.json` (in the
  directory of `HERDR_CONFIG_PATH`, else `$XDG_CONFIG_HOME/herdr`; read only inside herdr, never written, the last
  source wins); `allow` patterns from these sources pass the same safety check. UI commands listed by the user only
  take effect inside herdr. The `init` log event gains the `presets` in effect.
- Rules learned from real sessions: read-only agents no longer ask for text tools (`echo`, `printf`, `sort`, `uniq`,
  `cut`, `tr`, `comm`, `join`, `diff`, `basename`, `dirname`, `strings`), process and system reads (`date`, `du`,
  `df`, `pgrep`, `whoami`, `id`, `getent`, `printenv`, `env`, `command -v`, `hostname`), git reads (`ls-tree`,
  `rev-list`, `merge-base`, `worktree list`, `ls-remote`, `remote -v`, the listing forms of `branch` and `tag`, the
  reading forms of `config`), `npm view` and the mise reads (`--version`, `ls`, `ls-remote`, `tasks`, `settings`,
  `config ls|get`), with their `rtk` forms. Their write options ask (`sort --compress-program/-T`, `date -s`,
  `git ls-remote --upload-pack`, `npm view --cache/--logs-dir`, `mise -y`) and the write guard blocks
  `uniq IN OUT`, `date -s`/`date MMDDhhmm`, `hostname NAME`, `sort --compress-program=<writer>`,
  `git ls-remote --upload-pack=<writer>` and `mise set` / `npm set`.
- Sysadmin reads: `systemctl [--user]` read verbs (`status`, `show`, `cat`, `is-*`, `list-*`, `show-environment`,
  `get-default`), `journalctl`, `lsblk`, `findmnt`, `mount` / `mount -l`, `ip` address, link, route and neighbour
  tables, `pacman -Q`, `flatpak list|info|remotes|ps`, `snap list|info|services|connections`, the docker and podman
  listings and inspections (`ps`, `images`, `inspect`, `logs`, `volume|network ls|inspect`, …), `virsh` listings on the
  default, `qemu:///system` and `qemu:///session` connections, `VBoxManage list`, `vagrant box list`, `git grep`,
  `git check-ignore|show-ref|for-each-ref|hash-object`, the exact `--version` of common tools (node, python3, git, gh,
  opencode, docker, …), `mise version|which|where`. Options that reach another host or run a program ask
  (`systemctl -H/-M`, podman's `--runtime`/`--conmon`/`--root`/…, `git grep -O`, `git hash-object -w`, journalctl's
  maintenance options); docker and podman global options such as `-H`/`--context` come before the subcommand, so
  they ask too.
- The write guard blocks: journalctl's maintenance options in any abbreviation and `--cursor-file`; ip writes in
  every abbreviation iproute2 accepts (`ip link s` is `set`), `ip -batch`, `netns|vrf exec` of a writing command;
  pacman `-S` installs and upgrades, `-R`, `-U`, `-D --asdeps`, `-Fy`; the docker and podman subcommands that change
  containers, images, volumes, networks or contexts (listed in `commands.json` → `containers.write`), `save -o`,
  `export -o` and podman `--out`; `virsh 'A; B'` (one string runs every command in it) and `virsh -l FILE`;
  `git grep -O` in a bundle or with a writing pager; `git hash-object -w` in a bundle; `systemctl -H/-M` in a bundle
  or abbreviated, where the ask rules cannot see it.
- Exact `<program> <subcommand> --help` commands for git, herdr, npm and mise are allowed, after the always-ask flags
  (`git commit --help`, `herdr worktree create --help`); `opencode-readonly-guard rules` reports them.
- Standard utilities: text tools (`fold`, `nl`, `tac`, `rev`, `paste`, `expand`, `unexpand`, `fmt`, `column`, `seq`,
  `cmp`), checksums (`md5sum`, `sha*sum`, `b2sum`, `cksum`), dumps (`od`, `hexdump`, `xxd`, `base64`), compressed
  reads (`zcat`, `bzcat`, `xzcat`, `zgrep`), `readlink`, `realpath`, system information (`nproc`, `arch`, `uptime`,
  `free`, `lscpu`, `lsusb`, `lspci`, `groups`, `users`, `who`, `w`, `last`, `lastb`, `netstat`, `ss`, `lsof`, `ps`,
  `locale`), shell builtins (`type`, `test`, `true`, `false`, `sleep`, `shift`, `continue`, `break`, `read`, and
  exact `set -e`/`-u`/`-x`/`-o pipefail`/`-euo pipefail` forms), `git cat-file|describe`, `git reflog [show|list]`,
  the `git help` listings and `git help <subcommand>`, the exact `--version` of bash, tree-sitter, kitty, tmux,
  ImageMagick, LuaJIT, uv and shellcheck, with `rtk ps`. Their dangerous options ask and the write guard blocks
  them: `xxd INFILE OUTFILE` (any mode), `ss -K/--kill` and `-D/--diag FILE`, `lspci -q/-Q` (they write the ID
  cache), and the `ps` forms that print process environments: BSD `e` (`ps auxe`), the `environ` format, and `-e`
  outside the checked forms (when ps fails to parse a command line, it parses it again as BSD options, where `-e` is
  `e`).
- Exact allowed commands are also allowed followed by `2>&1` or `2>/dev/null` (`herdr --help 2>&1`), which opencode
  matches as part of the command: generated after the help layer, never over an ask flag, a deny or an agent's own
  rule.
- `opencode-readonly-guard doctor [--json]`: starts opencode in the current directory without a model and reports the
  plugin's entries and which one is in charge, why a `file://` copy cannot be imported (`dist/` missing), whether
  opencode's version is in each entry's `engines.opencode` range, the agents that carry the guard's rules, the errors
  of that start and the last start logged for the project. Exit status 1 when the guard is not active. A plugin that
  opencode cannot import runs no code, so only an outside check can see it.

### Fixed

- The write guard blocks commands that export environment variables to later commands (opencode does not prompt for
  them), except variables that only select a language or a format (`LANG`, `LC_*`, `TZ`, `GIT_OPTIONAL_LOCKS`, …,
  listed in `commands.json` → `environment`).
- Declarations without a variable name (`export`, `export -p`, `declare`, `declare -px`, `typeset -p`, `readonly`,
  `local`) and zsh's `typeset -m` printed every variable, the environment and its secrets included, in read-only
  agents without a prompt: opencode builds no pattern for declarations. The write guard blocks them; naming the
  variables (`declare -p NAME`) still works.
- `opencode-readonly-guard check` and `rules/cases.json` asked about statements opencode never prompts for: bare
  assignments, declarations, `unset`, `[ ]`, `[[ ]]`, loop headers, `if`/`then`/`do`/`!`/`{` and `cd`. They are left
  out now, as in opencode (checked against tree-sitter-bash); the write guard still judges them.
- The write guard missed `git reflog write` and `git reflog drop` (git 2.55), which change the reflog.
- The write guard blocked a sole trailing `--help` (`herdr worktree create --help`, `npm install --help`) like the
  subcommand itself.
- The write guard missed writes: `git remote -v add|rename|remove`, `git branch -v|--sort|--format NAME` and
  `git tag --sort|--format NAME` (these flags do not list), abbreviated or bundled git branch and tag write options
  (`git branch -a --edit-desc`, `-rd`), `sort --out=FILE`, and `uniq - OUT` / `uniq IN 5`. It blocked
  `git tag -n1 NAME`, which lists.
- The write guard blocked listings: bare `mount`, `systemctl show-environment|get-default`, and systemctl read verbs
  after an option that takes a value (`systemctl -t service list-units`). It missed journalctl's maintenance options
  when abbreviated (`--rot`, `--vac=1d`).
- `/guard-review` proposed already allowed stages of compound commands: every candidate was offered the general
  patterns of all the stages, and the prompt statistics counted allowed commands. Only the stages the current rules
  still ask about count now, each with its own general pattern.
- The plugin needed `@opencode-ai/plugin` in a `node_modules` at runtime: loaded from a path without one (a checkout
  restored without `node_modules`, a copy of `dist/` and `rules/`), it failed to import and opencode dropped it without a
  message, leaving read-only agents unguarded. `dist/index.js` and `dist/cli.js` are now bundles that only import Node
  built-ins (zod is included, its licence is in `dist/zod.LICENSE`).
- A plugin configured twice with different specs (a global and a project entry, two checkouts) ran twice: both copies
  injected rules, registered the review tools and logged every event. Only the copy loaded last runs now, which is the
  project's entry, and its options replace the global ones (they are not merged). The `init` event names the copy in
  charge (`module`) and every copy loaded (`copies`).
- A plugin that could not read its rule files (`server()` threw) was dropped by opencode, and an error in its config
  hook left the agents half configured: read-only agents ran with `bash: allow` and no write guard. The build now
  carries a copy of `rules/*.json`, which replaces a file that cannot be read: read-only agents keep the full policy
  and the write guard, an `error` event names the file (`where: "rules"`), the `init` event lists it (`builtin`), a
  warning toast says so, and the command-line tool warns on stderr. If the plugin still cannot start (an error in its
  config hook), it fails closed: read-only agents ask before every command (their own deny rules stay), the write
  guard stays on, an `error` event records the reason (`where`: `load` or `config`) and a toast says so. A copy that
  started is in charge instead, and its `init` event lists the broken copies (`failed`).

[Unreleased]: https://github.com/silopolis/opencode-readonly-guard/commits/main
