# opencode-readonly-guard

Make opencode's read-only agents (`plan`, `explore`, and any agent with `edit: deny`) actually read-only.

In opencode, "plan mode" is a request to the model, not a restriction: the `plan` and `explore` agents can run any
shell command, so a model that ignores the reminder can still `rm`, `sed -i` or `> file`. This plugin closes that gap:

- **Write guard.** Before opencode evaluates any permission rule, the full command line is parsed and refused if it
  writes: redirections in any position, `tee` to a file, `rm`/`cp`/`mv`/…, `sed -i`, `git commit`, `npm install`,
  `find -delete`, `curl -o`, and wrappers around them (`sudo`, `env`, `xargs`, `bash -c`, `$(…)`). It also refuses
  to export environment variables to the commands that follow and to list every variable (`export -p`, `declare`),
  which opencode never prompts for, and the `ps` forms that print process environments (`ps e`, `-o environ`). The
  model gets an error that tells it to return the data in its reply instead.
- **Shared allowlist.** Read-only agents ask before running anything except a vetted list of read-only commands
  (`ls`, `cat`, `rg`, `sort`, `echo`, `sha256sum`, `readlink -f`, `ps aux`, `ss -tlnp`, `git log`, `git branch -a`,
  `git describe`, `systemctl status`, `docker ps`, `ip addr`, `herdr agent list`, …). The list lives in
  [`rules/`](rules) as plain JSON that anyone can extend.
- **Reviewed learning.** An "always" answer in a read-only agent is only logged as a candidate. `/guard-review` shows
  candidates with safe pattern options, and a rule is added only after you confirm the exact pattern.
- **Event log.** Every shell command, block, prompt and answer in a read-only agent is recorded, so the policy can be
  improved with data.

Tested with opencode 1.19.3 (supported range `>=1.18.29 <2`). opencode 2.x has a different plugin API and is not
supported yet, see [TODO.md](TODO.md).

## Install

```sh
opencode plugin opencode-readonly-guard --global   # adds it to ~/.config/opencode/opencode.json
```

or add it to your config by hand, with options if you want them:

```jsonc
// opencode.json
{
  "plugin": [
    "opencode-readonly-guard",
    // or: ["opencode-readonly-guard", { "agents": { "include": ["reviewer"] }, "allow": ["uptime *"] }]
  ],
}
```

Restart opencode afterwards (config and plugins are loaded once at startup).

Other ways:

| Tool        | Command                                                                           |
| ----------- | --------------------------------------------------------------------------------- |
| npm / bun   | `npm i -g opencode-readonly-guard` · `bun add -g opencode-readonly-guard`         |
| mise (CLI)  | `mise use -g npm:opencode-readonly-guard`                                         |
| From source | `git clone … && mise run setup build`, then `"plugin": ["file:///path/to/clone"]` |

> The package is not published to npm yet (see [TODO.md](TODO.md)). Until then, use the from-source route. A session
> started inside the clone loads its build anyway, through the repository's own config (see [Development](#development)).

Configured more than once (a global and a project entry, or two checkouts), the plugin runs once: the copy loaded
last is in charge and the others stay passive. opencode loads the global config before the project's, so the
project's entry wins, and its options replace the global entry's (they are not merged). The `init` event in the log
names the copy in charge (`module`) and every copy loaded (`copies`). A copy built before this rule does not know
about it and still runs next to the others.

The build carries a copy of `rules/*.json`. A rule file that cannot be read (corrupt, missing) is replaced by that
copy, so read-only agents keep the full policy and the write guard; an `error` event (`where: "rules"`) names the
file, the `init` event lists it under `builtin`, and a warning toast says so. A file that reads fine is always used,
so editing the rules of a checkout needs no build. If the plugin still cannot start (an error while it applies the
rules), it fails closed: read-only agents ask before every shell command (their own deny rules stay), the write guard
stays on, an `error` event names the reason and a toast says so. These toasts are shown whatever the `toast` option.
A copy that started, loaded before or after a broken one, is in charge instead, and its `init` event lists the broken
copy under `failed`. A plugin that opencode cannot even import (a checkout without `dist/`) runs no code and cannot
report anything: run `opencode-readonly-guard doctor` in the project to check.

## Using it

**`/guard-review`** (registered by the plugin, runs in `build`) summarizes the log: blocked commands, the most-prompted
commands and allowlist candidates. For each candidate you pick the exact rule to keep (the exact command, the same
command limited to its directory, or opencode's general pattern, whichever the safety check accepts) or dismiss it.
opencode then asks you to confirm that exact pattern before it is written to `readonly-guard.json`. New rules apply
after a restart. In read-only agents the review tools are hidden, so an agent cannot extend its own allowlist.

**Command-line tool** (`opencode-readonly-guard`, also available as `npx opencode-readonly-guard`):

```text
check [--json] [--no-store] <command>   what a read-only agent gets: allow | ask | block (exit status 0 | 1 | 2)
vet <pattern>                           may this pattern be added to the allowlist?
rules [--json]                          print the shared allowlist and the always-ask flags
review [--limit N]                      print the log summary
install [-g] [--force]                  opencode plugin opencode-readonly-guard
doctor [--json]                         is the guard active here? (exit status 0 | 1)
```

```console
$ opencode-readonly-guard check 'git log --oneline | head'
allow
$ opencode-readonly-guard check 'ls | cat > notes.txt'
block  write redirection "> notes.txt"
$ opencode-readonly-guard check 'uptime'
ask    needs approval: uptime
```

`doctor` starts opencode in the current directory without a model (`opencode debug config`, the plugin's log for that
run goes to a temporary directory) and reports: this plugin's entries in the config and which one is in charge, why a
`file://` copy cannot be imported (`dist/index.js is missing: a checkout that was not built, run mise run build in
…`), whether opencode's version is in each entry's `engines.opencode` range, which agents carry the guard's rules and
how many, the errors of that start (a rule file replaced by the built-in copy is a warning), and the last start
logged for the project. It exits with 1 when the guard is not active, including when it failed closed; `--json`
prints the report.

## How the policy is built

For every read-only agent the plugin writes this ordered bash rule list into the config (the last matching rule wins):

1. `"*": ask`
2. the shared allowlist, [`rules/allow.json`](rules/allow.json)
3. presets that are on (see [Working inside herdr](#working-inside-herdr)), learned rules (`readonly-guard.json`) and
   the `allow` option, each re-checked at startup
4. the agent's own bash rules, if it had any
5. the always-ask flags, [`rules/ask.json`](rules/ask.json): `find -delete/-exec`, `rg --pre`, `git … --output`,
   `sort --compress-program`, `git ls-remote --upload-pack`, …
6. the help layer: exact `<program> <subcommand> --help` commands for git, herdr, npm and mise (`git commit --help`,
   `herdr worktree create --help`) and `git help <subcommand>`, derived from
   [`rules/commands.json`](rules/commands.json). They only print help; the layer holds no wildcard, never covers an
   ask-listed flag, and never overrides a deny or an exact rule of the agent's own.
7. the redirection twins: `<command> 2>&1` and `<command> 2>/dev/null` for every exact command allowed above
   (`herdr --help 2>&1`), because opencode matches a command together with its redirections. A twin is only added
   where no rule but `*` matches it, so it never overrides an ask flag, a deny or an agent's own rule.

Because the flags come after every allow rule, a broad learned rule such as `find *` never silences `find . -delete`.

Some commands are only allowed in their read-only forms, because the bare subcommand writes: `git branch` lists, but
`git branch NAME` creates a branch, so the allowlist has `git branch`, `git branch -a *`, `git branch --contains*`, …
and the write guard blocks the creating forms. System tools follow the same idea: `ip addr *` is allowed because the
guard resolves every verb abbreviation iproute2 accepts and blocks `add`, `set`, `flush`, …; `docker ps *` because
docker only takes `-H`/`--context` before the subcommand, where no rule matches. `git config KEY`, `git -C DIR …`
and commands behind an environment prefix (`LC_ALL=C sort`) still ask.

Read-only agents are `plan`, `explore`, every agent whose `permission.edit` is `deny` (or `tools.edit: false`), plus
`agents.include`, minus `agents.exclude`. `plan` additionally asks before delegating to a subagent that is not
read-only, and never to `general`.

## Working inside herdr

Agents that run in a [herdr](https://herdr.dev) pane can inspect it with the `herdr` CLI. The rules treat `herdr` like
`git`: they judge the subcommand, never the program as a whole (`herdr *` is never accepted).

- **Allowed without a prompt:** `--help`, `--version`, `--skill`, a bare command group (`herdr agent`, `herdr pane`, …)
  and the read-only subcommands: `status`, `agent list|get|read|wait|explain`,
  `pane list|current|get|layout|process-info|neighbor|edges|read|wait-output`, `workspace|tab list|get`,
  `worktree|session|machine|plugin|integration` listings, `api snapshot|schema`, `config check`, `channel show`.
  Also `herdr <subcommand> --help` exactly, for every subcommand below except the UI ones
  (`herdr worktree create --help`): it only prints help.
- **Always asks**, even when an agent's own rules allow `herdr *`, and can never be learned (exact or with a wildcard):
  every other subcommand, such as `pane send-text|send-keys|run|split|close`, `agent prompt|send-keys|start`,
  `tab|workspace create|close|focus`, `server stop`, `session stop`. A read-only agent must not send instructions to
  another agent, so `agent prompt` stays a prompt. The `--machine`, `--session` and `--remote` prefixes, bare `herdr`
  (it opens the terminal UI) and `--trust-repository` ask too.
- **Blocked** like other writes: `herdr update`, `worktree create|remove`, `config reset-keys`,
  `integration install|uninstall`, `session delete`, `plugin install|update`, `api schema --output FILE`, and
  `pane run PANE CMD` when `CMD` would itself be blocked (`herdr pane run w1:p2 'rm -rf build'`).
- **UI commands, on inside herdr:** `herdr tab rename` and `herdr notification show` only change what herdr
  displays, which is how a plan-mode agent can report its state. They are the `herdr-ui` preset: allowed without a
  prompt when opencode runs in a herdr pane (`HERDR_ENV=1`), and not otherwise. Outside a pane the herdr CLI still
  reaches the running session and acts on whatever is focused there, so a UI command listed in your store or options
  is ignored outside herdr too. The preset is built into the plugin and is not part of the shared allowlist.

  Switch it off with `"presets": { "herdr-ui": false }`, and list the one command you want instead:

  ```jsonc
  // ~/.config/opencode/readonly-guard.json (the store), or in the plugin options,
  // or in herdr's own directory: ~/.config/herdr/readonly-guard.json
  { "presets": { "herdr-ui": false }, "allow": ["herdr tab rename *"] }
  ```

  Where the settings come from:

  | Source                                  | Keys                    | Notes                                                       |
  | --------------------------------------- | ----------------------- | ----------------------------------------------------------- |
  | plugin options in `opencode.json`       | `presets`, `allow`      | lowest precedence                                           |
  | the store `readonly-guard.json`         | `presets`, `allow`, ... | the file `/guard-review` writes                             |
  | `readonly-guard.json` in herdr's config | `presets`, `allow`      | read only inside herdr, never written, wins over the others |

  herdr's directory is the one holding `$HERDR_CONFIG_PATH`, else `$XDG_CONFIG_HOME/herdr` (`~/.config/herdr`). If
  sources disagree about a preset, the last in the table wins; `allow` lists add up. Every `allow` pattern passes the
  same safety check, so no file can allow `herdr agent prompt`, and herdr's file may only hold `herdr …` patterns.
  `opencode-readonly-guard vet 'herdr tab rename *'` shows what the safety check says about a pattern, and `check`
  follows the same rules as the plugin (`--no-store` means the shared rules only: no store, no presets).

herdr is not in opencode's table of known programs, so an "always" answer to any herdr prompt is saved by opencode as
`herdr *`, for every agent until restart. The write guard still blocks the commands above, but nothing stops
`herdr pane send-text`. Answer "once" to herdr prompts. rtk does not rewrite herdr commands, so there are no `rtk herdr`
rules.

## Options

Set them with the tuple form: `["opencode-readonly-guard", { … }]`.

| Option           | Default                                         | Meaning                                                         |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| `agents.include` | `[]`                                            | extra agents to treat as read-only (they must exist)            |
| `agents.exclude` | `[]`                                            | agents to leave alone                                           |
| `allow`          | `[]`                                            | extra bash patterns to allow; each passes the same safety check |
| `presets`        | `{}`                                            | switch built-in rule sets on or off: `{ "herdr-ui": false }`    |
| `store`          | `$XDG_CONFIG_HOME/opencode/readonly-guard.json` | learned rules, dismissed candidates, agent lists                |
| `logDir`         | `$XDG_DATA_HOME/opencode/readonly-guard`        | `events.jsonl` (rotated at 5 MB to `events.old.jsonl`)          |
| `toast`          | `true`                                          | warn when an "always" answer is given in a read-only agent      |
| `command`        | `"guard-review"`                                | name of the review command, or `false` to not register it       |

`READONLY_GUARD_STORE` and `READONLY_GUARD_DATA` override the default paths (an explicit option wins). The store file
is plain JSON and safe to keep in your dotfiles; the event log contains the commands your agents ran, so keep it local.
The startup `init` event in the log lists the `presets` in effect next to the number of `learned` rules, and the
copies of the plugin loaded or `failed`, and the rule files replaced by the built-in copy (`builtin`, see
[Install](#install)); a copy that fails closed logs an `error` event instead (`where`: `load` or `config`,
`writeGuard`: whether the write guard is still on).

## What it does not do

This is an accident preventer and a policy engine, not a sandbox.

- Only the `bash`/`shell` tool is covered. MCP tools, `webfetch` and others follow opencode's normal permissions.
- Interpreters can write (`python -c`, `node -e`, `awk`, `sqlite3 .shell`). They are not on the allowlist, so they
  prompt, but the guard does not read their code, and a broad "always" answer would let them through.
- Parsing is a hand-written approximation of POSIX shell; anything it cannot parse is blocked rather than guessed.
- Linux and macOS shells only. PowerShell is not parsed.
- "Always" answers made in opencode itself stay in effect for all agents until restart, see the findings below. The
  plugin warns, logs them and keeps the write guard on top, but it cannot revoke them.

## Findings about opencode 1.19.3

What building this taught us. Each point was checked against the binary or by a live run, and several are worth an
upstream issue (they are in [TODO.md](TODO.md)).

**Permissions**

- Plan mode is a prompt. The `plan` agent only denies the `edit` tool (except plan files); its `bash` is `* allow`
  and so is `explore`'s. The "READ-ONLY phase" text is a reminder injected into the conversation.
- Rules are evaluated in order and the last match wins; `*` matches anything and a trailing ` *` also matches the bare
  command.
- Bash commands are split with tree-sitter and each simple command is matched on its own text. That text includes a
  redirection only when the command's direct parent is the redirection, so `cat a > b` is matched as written, while
  the redirections of later pipeline stages (`a | b > f`), `{ …; } > f` and `( … ) > f` are invisible to patterns.
  Glob rules therefore cannot stop those writes; a parser in `tool.execute.before` can.
- Commands inside `$(…)`, backticks and `<(…)` are checked as separate commands.
- Only tree-sitter `command` nodes get a pattern, and `cd`, `chdir`, `pushd` and `popd` are skipped. Declarations
  (`export`, `declare`, `local`, `readonly`, `typeset`), `unset`, bare assignments (`B=/x`), `[ ]`, `[[ ]]` and
  `(( ))` never prompt, whatever they do: without the write guard, `export -p` prints the whole environment in plan
  mode unasked. The guard is the only check on them.

**"Always" answers**

- The saved pattern is the command prefix plus `*`, using a built-in table of how many words matter (`git log *`,
  `npm view *`) and falling back to the first word. Unknown programs become `prog *`: answering "always" to
  `tee /dev/null` allowed `tee *`, and for anything rewritten by the rtk plugin it is `rtk *`.
- It is kept in memory for the whole opencode process, is checked after every agent's rules (so it beats `ask` and
  `deny`), applies to all agents and sessions, and is lost on restart. The `permission` table in the database stays
  empty.

**Plugin API**

- `tool.execute.before` runs before the permission check; throwing from it aborts the tool call and the message reaches
  the model. This is what makes the write guard possible.
- The `permission.ask` hook is declared in the types and docs but is never called. A plugin cannot answer prompts
  itself, so learning has to go through a review step.
- The `config` hook may edit `agent.<name>.permission`; the rules end up after the built-in ones in the resolved
  agent (`opencode debug agent <name>` shows them). A permission set globally is appended after every agent's rules.
- `chat.params` reports the agent of each model call, including subagents. The utility agents `title`, `summary` and
  `compaction` share the session, so they must be ignored when tracking which agent a session belongs to. The v1 SDK
  types do not expose `agent` on sessions, but the runtime does (used as a fallback).
- Permission events are `permission.asked` / `permission.replied` at runtime, although the v1 SDK types still say
  `permission.updated`.
- Plugin tools can call `context.ask()` to raise a permission prompt. Agents start from `* allow`, so the plugin adds a
  global `readonly_guard_allow: ask` rule (evaluated after every agent's rules) to force the confirmation prompt.

**Plugin packaging (v1)**

- opencode treats every export of a plugin module as a plugin and calls it. Export only the default definition.
- A package is loaded from `exports["./server"]`, else `main`. A default export `{ id, server }` is supported since
  1.18.29. `engines.opencode` is enforced for npm packages only (one outside its range is skipped with a
  `session.error` event); a plugin loaded from a path runs whatever its range says. Peer dependencies such as
  `@opencode-ai/plugin` are installed for you.
- That install only happens for npm packages. A plugin loaded from a path (`file://…`) resolves its imports from that
  path, and if one fails (no `node_modules` there) opencode drops the plugin without a log line, even at `DEBUG`, while
  `opencode debug config` still lists it. This is why `dist/` is a bundle that only imports Node built-ins. The same
  goes for a checkout without `dist/` and for a `file://` path that does not exist: `opencode debug config` exits 0
  with nothing on stderr, and opencode starts as if nothing were wrong. A plugin that fails to import cannot report
  anything itself; only an outside check can (`opencode-readonly-guard doctor`).
- A plugin whose `server()` throws is dropped too, with one `failed to load plugin` line in opencode's log; an error
  in a `config` hook is logged (`plugin config hook failed`) and opencode goes on. Either way the agents keep whatever
  the config holds at that point, which is why this plugin carries a copy of its rule files, catches its own errors
  and fails closed.
- A toast sent while opencode starts (from `server()` or a `config` hook, without awaiting it: the request waits for
  the instance being started) reaches clients listening to the global event stream, which the TUI does.
- Plugin entries are merged only when they name the same `file://` URL or npm package (the last one is kept). Two
  specs of the same plugin load two copies of its module. Each gets the same input object, every `server()` runs
  before any `config` hook, global entries before project ones, and `hooks.tool` is read after all of them, which is
  what lets the copies agree on one of them.
- opencode 2.x plugins are `Plugin.define({ id, setup })`, V1 plugins do not run there, and V2 has a real
  `permission.hook("evaluate")` that would remove most of these workarounds.

**Models and tooling**

- Models in plan mode often refuse to run a write command to "test" the guard, because of the reminder. To exercise
  it, delegate to `explore` from `build`, or use an `edit: deny` harness agent (see the e2e tests).
- The rtk plugin rewrites commands (`ls` → `rtk ls`) before permissions are evaluated, so patterns must match the
  rewritten form (the allowlist has `rtk …` entries). Models then see a command they did not write and retry it
  several times, which wastes tokens (observed with Haiku and Sonnet).
- When spawning `opencode run` from another program, set `PWD` to the working directory (opencode trusts it over the
  real cwd; a mismatch fails with an `UnknownError`).

## Development

Everything is managed with [mise](https://mise.jdx.dev); Git hooks with [hk](https://hk.jdx.dev).

```sh
mise install                # bun, node, hk, actionlint, shellcheck and the pinned opencode
mise run setup              # bun install + git hooks (prettier, oxlint, tsc, conventional commits)
mise run check              # lint, formatting, types, unit tests (what CI runs)
mise run test:integration   # builds, then drives the real opencode without a model, and a packed tarball
mise run test:e2e           # opt-in, real model: E2E_MODEL=anthropic/claude-haiku-5-5
mise tasks                  # all tasks
```

The repository's own `opencode.json` loads the plugin from the checkout's `dist/` (`"plugin": ["."]`), so opencode
sessions started in a checkout or worktree are guarded by its build, work in progress included. Until
`mise run build` has run there, the entry is skipped without a word and a global install, if any, guards instead;
`bun src/cli.ts doctor` says which copy is in charge. [AGENTS.md](AGENTS.md) ("Hazards") explains what a build
changes for running and new sessions.

Code style follows opencode: TypeScript (strict, NodeNext), no semicolons, 120 columns, oxlint, prettier. See
[CONTRIBUTING.md](CONTRIBUTING.md) for adding rules and test cases.

## License

[MIT](LICENSE), the same as opencode.
