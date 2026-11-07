# AGENTS.md

Instructions for coding agents working on this repository. [README.md](README.md) explains what the plugin does and
what opencode taught us; [CONTRIBUTING.md](CONTRIBUTING.md) is the guide for human contributors.

## The project

An opencode plugin (v1 plugin API, opencode `>=1.18.29 <2`) that makes read-only agents (`plan`, `explore`, agents
with `edit: deny`) actually read-only: it parses every shell command and refuses writes before opencode's permission
check, injects the shared allowlist from `rules/` into those agents, and logs their prompts for a reviewed learning
step. The command-line tool `opencode-readonly-guard` exposes the same decisions.

## Commands

Tool versions are pinned in `mise.toml` (bun, node, hk, actionlint, shellcheck, opencode). Run from the repository root.

| Command                     | What it does                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `mise run setup`            | `bun install --frozen-lockfile` and the hk git hooks (shared by all worktrees)     |
| `mise run check`            | lint, fmt:check, typecheck and test: what CI runs; must pass before every commit   |
| `mise run lint`             | `oxlint --deny-warnings`                                                           |
| `mise run fmt`              | `prettier --write .`; `fmt:check` only checks (Markdown and JSON included)         |
| `mise run typecheck`        | `tsc --noEmit` over `src/` and `test/`                                             |
| `mise run test`             | unit tests (`bun test test/unit`); one file: `bun test test/unit/analyze.test.ts`  |
| `mise run build`            | bundle `src/` into `dist/` (plugin and CLI, zod included; read the hazards first)  |
| `mise run test:integration` | build, then drive the real opencode without a model and install the packed tarball |
| `mise run test:e2e`         | build, then drive a real model with your credentials; costs money, only when asked |

No build needed: `bun src/cli.ts check --no-store '<command>'` prints what a read-only agent gets (allow, ask or block)
under the shared rules, and `bun src/cli.ts vet '<pattern>'` runs the safety check that learned patterns go through.

## Code style

- TypeScript `strict`, `module`/`moduleResolution` NodeNext, ES2023. Relative imports end in `.js`, type-only imports
  use `import type` (`verbatimModuleSyntax`), Node built-ins the `node:` prefix.
- prettier: no semicolons, 120 columns, 2 spaces. oxlint denies warnings; `any` and `console` are errors.
- `src/index.ts` keeps a single default export: opencode calls every export of a plugin module as a plugin.
- Every behaviour change comes with a unit test; comments say why, not what.

## Map

`src/`

- `index.ts`: the module's only export, `{ id, server }`.
- `plugin.ts`: the opencode hooks: `config` (inject the rules, register `/guard-review`), `tool.execute.before` (the
  write guard), `event` (log prompts and answers), `chat.params` (which agent owns a session). Every hook returns at
  once unless its copy is in charge. `copies.ts`: how copies of the plugin in one opencode instance (a global and a
  project entry) agree that the one loaded last runs; a new hook must check `copy.active()` too. A copy that fails in
  its config hook, or cannot read its rules even from the built-in copy, fails closed (`failClosed` in `inject.ts`)
  unless a copy that started is in charge.
- `shell.ts`: POSIX-ish tokenizer (simple commands, redirections, substitutions); what it cannot parse is blocked.
- `analyze.ts`: the write guard: redirections, wrappers, `sed -i`, `find -delete`, git and package-manager writes, …
  `environment.ts`: statements that export variables to later commands (`export`, `set -a`, namerefs, a new value
  for an exported variable) or list them all (`export -p`), which opencode never prompts for. `programs.ts`: its
  argument parsers for system tools (systemctl, journalctl, ip, mount, pacman, docker/podman, virsh, lspci, ss, xxd,
  ps), which follow each program's own option rules (abbreviations, bundles, values).
- `wildcard.ts`: opencode's pattern matching, last match wins. `decide.ts`: allow, ask or block for a command line,
  over the stages opencode builds a pattern for (`simpleCommands` in `shell.ts`).
- `rules.ts`: loads `rules/*.json` and builds the ordered bash rule list, ending with the help layer (exact
  `<program> <subcommand> --help` and `git help <subcommand>` commands) and the redirection twins (`<exact rule> 2>&1`,
  `2>/dev/null`). A file that cannot be read is replaced by the copy `embed.ts` builds in (a Bun macro: `bun build`
  and `bun` itself replace its call with the files' text). `inject.ts`: finds the read-only agents and writes their
  rules into opencode's config.
- `classify.ts`: the safety check for patterns (learned rules, the `allow` option, `vet`).
- `sources.ts`: presets (`herdr-ui`) and the merge of options, store and herdr's file. `options.ts`: plugin options
  and default paths.
- `store.ts`: learned rules (`readonly-guard.json`). `log.ts`: the event log (`events.jsonl`, rotated).
- `review.ts`, `tools.ts`, `command.ts`: the log summary, the `readonly_guard_review` and `readonly_guard_update`
  tools, the `/guard-review` command.
- `commands.ts`, `cli.ts`: the command-line tool. `doctor.ts`: its `doctor` subcommand (runs `opencode debug config`
  through `CliIo.exec`). `constants.ts`: ids and tool names.

`rules/`: `allow.json`, `ask.json`, `commands.json`, `cases.json` and their JSON Schemas in `schema/` (CONTRIBUTING.md
describes each file). They ship in the npm package and are read at runtime; `dist/` also carries a copy from build
time, used only when a file cannot be read.

`test/`

- `unit/`: mostly one file per module. `cases.test.ts` runs every case in `rules/cases.json`; `rules.test.ts` checks
  the rule files against each other.
- `integration/`: the real opencode without a model (`opencode debug config|agent` in a sandbox project), two copies
  of the plugin in one opencode, copies with corrupt rule files, `doctor`, and the packed tarball. Broken copies are
  `file://` copies of the build (`copyPlugin()`); never put an unpublished npm name in a config, opencode would
  install whatever the registry serves under it.
- `e2e/`: a real model drives a read-only harness agent; opt-in (`OPENCODE_E2E=1`, set by the mise task).
- `helpers.ts`: `sandbox()`, a throwaway project with its own XDG directories, store and log (and, with
  `globalPlugin`, its own global config). Use it for anything that starts opencode. `childEnv()`: the caller's
  environment without `GIT_*` and `HERDR_*`, for any other child process (see "Hazards").

## Changing the rules

Follow "Adding a command to the allowlist" in [CONTRIBUTING.md](CONTRIBUTING.md); do not work from memory. A rule
change and its cases in `rules/cases.json` go in the same commit. `/add-rule <command>` walks through it.

## opencode in this repository

- `opencode.json` lets agents run the check tasks (`mise run check|lint|fmt|fmt:check|typecheck|test`, `bun test`),
  the read-only CLI subcommands and read-only `git` and `gh` commands without a prompt, plus their `rtk …` forms for
  the rtk plugin. Everything else asks, including `mise run build`, `setup`, the integration and e2e tests, `:::` task
  lists and `--output`. Widen it in your own config, not here.
- `.opencode/commands/`: `/check` (run `mise run check`, fix or report) and `/add-rule <command>`.
- `"plugin": ["."]` loads the plugin from this checkout's own `dist/` (dogfooding): a session started in a checkout
  or worktree is guarded by that checkout's build, see "Hazards". Without a build the entry is skipped without a
  word. In read-only agents (`plan`, `explore`) the plugin's rules come after the `permission` block above, so its
  `"*": "ask"` wins there: only the shared allowlist runs without a prompt, and the check tasks, `bun src/cli.ts` and
  `gh` ask; `build` keeps them. If you also configure the plugin globally, the project's entry is in charge here and
  its options (none) replace your global entry's options. `bun src/cli.ts doctor` shows which copy guards a
  directory (`test/integration/dogfood.test.ts` pins all of this).

## Dependency updates

Renovate (`renovate.json`) opens grouped weekly pull requests for npm and `bun.lock`, `mise.toml` (opencode included),
`hk.pkl` and the GitHub Actions; see "Dependency updates" in CONTRIBUTING.md. A pull request that bumps opencode or
`@opencode-ai/plugin` is ready only when `mise run test:integration` passes.

## Commits

- [Conventional Commits](https://www.conventionalcommits.org), checked by hk's `commit-msg` hook; follow the format by
  hand where the hooks are not installed. Scope by module or area, as in `git log`: `feat(rules)`, `fix(analyze)`,
  `test(integration)`, `docs(todo)`, `build(mise)`, `ci(github)`.
- One logical change per commit. Run `mise run check` before committing.
- User-visible changes (rules, options, CLI, behaviour) get a line in `CHANGELOG.md` under "Unreleased"; repository
  tooling does not.

## Hazards

- **`dist/` is live.** It is gitignored build output, and opencode loads it from any checkout that a config names as
  `file:///path/to/checkout`, this repository's own `opencode.json` included (`"."`, the checkout it sits in).
  `mise run build`, and every task that depends on it (`test:integration`, `test:e2e`, `pack`), replaces the plugin
  for every opencode session that starts afterwards with that checkout configured: the sessions started in that
  checkout, and every directory whose config names it (a global `file://` entry to the main checkout). Sessions
  already running keep the copy they loaded. Build in your own clone or worktree, never in a checkout that other
  sessions load. Unit tests and `bun src/cli.ts` do not need `dist/`.
- **A worktree's build guards that worktree.** Its sessions load its `dist/`, work in progress included, and that
  copy is in charge over a global entry to the main checkout (the project's entry is loaded last). A build there
  only reaches sessions started in that worktree, but a build that loads and misbehaves (blocks too much, asks for
  nothing) misguards them; `bun src/cli.ts doctor` names the copy in charge. While the worktree has no `dist/` (never
  built, or a session starting mid-build: the build deletes it first), its entry is skipped without a word and the
  global copy guards it, or nothing does without one. A worktree built before copies agreed on one (#8) runs next to
  the global copy: rebuild it.
- **Never touch the user's real store, log or config.** By default the plugin reads `readonly-guard.json` and writes
  `events.jsonl` under the XDG directories. Tests go through `sandbox()`, or set `READONLY_GUARD_STORE` and
  `READONLY_GUARD_DATA` to temporary paths. The same goes for running opencode by hand: `opencode debug config` loads
  every globally configured plugin, including an installed copy of this one, which then writes to its log.
- **Tests run inside git hooks.** The pre-push hook runs the unit tests with git's hook environment: in a linked
  worktree git exports `GIT_DIR=<main>/.git/worktrees/<name>`, and hk adds `GIT_WORK_TREE`. A test that starts git
  with the inherited environment acts on the worker's repository, wherever its `cwd`: `git init` in a temporary
  directory wrote `core.bare` or `core.worktree` into the shared `.git/config` (`git status` in the main checkout then
  shows the worktree's files), and `git commit` committed on the worker's branch. Start git, opencode and anything
  that may run git through `sandbox()`, or pass `env: childEnv()` (`test/helpers.ts`), which drops every `GIT_*`.
