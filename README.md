# opencode-readonly-guard

Make opencode's read-only agents (`plan`, `explore`, and any agent with `edit: deny`) actually read-only.

In opencode, "plan mode" is a request to the model, not a restriction: the `plan` and `explore` agents can run any
shell command, so a model that ignores the reminder can still `rm`, `sed -i` or `> file`. This plugin closes that gap:

- **Write guard.** Before opencode evaluates any permission rule, the full command line is parsed and refused if it
  writes: redirections in any position, `tee` to a file, `rm`/`cp`/`mv`/…, `sed -i`, `git commit`, `npm install`,
  `find -delete`, `curl -o`, and wrappers around them (`sudo`, `env`, `xargs`, `bash -c`, `$(…)`). The model gets an
  error that tells it to return the data in its reply instead.
- **Shared allowlist.** Read-only agents ask before running anything except a vetted list of read-only commands
  (`ls`, `cat`, `rg`, `git log`, …). The list lives in [`rules/`](rules) as plain JSON that anyone can extend.
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
    // or: ["opencode-readonly-guard", { "agents": { "include": ["reviewer"] }, "allow": ["whoami *"] }]
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

> The package is not published to npm yet (see [TODO.md](TODO.md)). Until then, use the from-source route.

Load it once (not from both a global and a project config): two copies would both inject rules, register the same
tools and log every event twice.

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
```

```console
$ opencode-readonly-guard check 'git log --oneline | head'
allow
$ opencode-readonly-guard check 'ls | cat > notes.txt'
block  write redirection "> notes.txt"
$ opencode-readonly-guard check 'whoami'
ask    needs approval: whoami
```

## How the policy is built

For every read-only agent the plugin writes this ordered bash rule list into the config (the last matching rule wins):

1. `"*": ask`
2. the shared allowlist, [`rules/allow.json`](rules/allow.json)
3. learned rules (`readonly-guard.json`) and the `allow` option, each re-checked at startup
4. the agent's own bash rules, if it had any
5. the always-ask flags, [`rules/ask.json`](rules/ask.json): `find -delete/-exec`, `rg --pre`, `git … --output`, …

Because the flags come last, a broad learned rule such as `find *` never silences `find . -delete`.

Read-only agents are `plan`, `explore`, every agent whose `permission.edit` is `deny` (or `tools.edit: false`), plus
`agents.include`, minus `agents.exclude`. `plan` additionally asks before delegating to a subagent that is not
read-only, and never to `general`.

## Options

Set them with the tuple form: `["opencode-readonly-guard", { … }]`.

| Option           | Default                                         | Meaning                                                         |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| `agents.include` | `[]`                                            | extra agents to treat as read-only (they must exist)            |
| `agents.exclude` | `[]`                                            | agents to leave alone                                           |
| `allow`          | `[]`                                            | extra bash patterns to allow; each passes the same safety check |
| `store`          | `$XDG_CONFIG_HOME/opencode/readonly-guard.json` | learned rules, dismissed candidates, agent lists                |
| `logDir`         | `$XDG_DATA_HOME/opencode/readonly-guard`        | `events.jsonl` (rotated at 5 MB to `events.old.jsonl`)          |
| `toast`          | `true`                                          | warn when an "always" answer is given in a read-only agent      |
| `command`        | `"guard-review"`                                | name of the review command, or `false` to not register it       |

`READONLY_GUARD_STORE` and `READONLY_GUARD_DATA` override the default paths (an explicit option wins). The store file
is plain JSON and safe to keep in your dotfiles; the event log contains the commands your agents ran, so keep it local.

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
  1.18.29. `engines.opencode` is enforced. Peer dependencies such as `@opencode-ai/plugin` are installed for you.
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

Code style follows opencode: TypeScript (strict, NodeNext), no semicolons, 120 columns, oxlint, prettier. See
[CONTRIBUTING.md](CONTRIBUTING.md) for adding rules and test cases.

## License

[MIT](LICENSE), the same as opencode.
