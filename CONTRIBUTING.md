# Contributing

Thanks for helping to make read-only agents trustworthy. The most useful contributions are **rules**: commands that
are safe to run without asking, flags that make a safe command unsafe, and test cases that pin the behaviour down.

## Setup

```sh
mise install        # bun, node, hk, actionlint, shellcheck, opencode (pinned in mise.toml)
mise run setup      # bun install + git hooks
mise run check      # what CI runs: lint, format, types, unit tests
```

Without mise you need Bun 1.4+, Node 22+ and `bun install`; `bun run check` does the same as `mise run check`.

## The shared rules

Everything the plugin decides on its own comes from the JSON files in [`rules/`](rules). They are editor-validated by
the JSON Schemas in [`rules/schema/`](rules/schema) and checked by the unit tests.

| File            | Contents                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `allow.json`    | opencode bash patterns that read-only agents may run without a prompt. Each has a `reason`.      |
| `ask.json`      | patterns that always ask, even when allowed above: flags that write files or run other programs. |
| `commands.json` | classification used by the write guard and the learning safety check (see below).                |
| `cases.json`    | expected verdicts for commands (`allow` / `ask` / `block`) and for patterns (`ok` true / false). |

Pattern syntax is opencode's: `*` matches anything, `?` one character, and a trailing ` *` also matches the bare
command. The **last matching rule wins**, which is why `ask.json` is applied after everything else.

### Adding a command to the allowlist

An allow rule must be safe in **every** use the pattern can match, not just the common one.

1. Look for options that write files, delete, or run other programs (`--output`, `-o FILE`, `-exec`, `--pre`, `-x`,
   `-i`, `--in-place`, `-delete`, …). If any exists, either do not allow the command, or add the dangerous option to
   `ask.json` (a prompt) and, if it is unambiguous, to the analyzer in `src/analyze.ts` (a block).
2. Add the pattern and a short `reason` to `allow.json`. Use `cmd *` for "any arguments", `cmd sub*` for a family of
   subcommands, and the exact text for a single use.
3. If the command is reached through the rtk plugin, add the `rtk …` form too.
4. Add cases to `cases.json`: at least one `allow`, plus an `ask` or `block` case for each dangerous option.
5. Run `mise run check`.

Other files:

- **`commands.json` → `hardWrite`:** commands that modify files whatever their arguments. They are blocked.
- **`commands.json` → `packageManagers`, `git`:** which subcommands write, and which git subcommands may get a
  wildcard rule from `/guard-review`.
- **`commands.json` → `wildcardSafe`:** commands for which `/guard-review` may offer `cmd *`. Only add a command whose
  every read-only use is harmless and whose write options are covered by `ask.json` or the analyzer.

Behaviour that depends on arguments (`tee`, `sed -i`, `find -exec`, `curl -o`, `git branch <name>`, …) lives in
`src/analyze.ts`; add a unit test in `test/unit/analyze.test.ts` and a case in `cases.json`.

## Tests

| Tier        | Command                     | Needs                                    |
| ----------- | --------------------------- | ---------------------------------------- |
| unit        | `mise run test`             | nothing                                  |
| integration | `mise run test:integration` | opencode on `PATH`; builds `dist/` first |
| e2e         | `mise run test:e2e`         | opencode credentials; costs a few cents  |

Unit tests include every case in `cases.json`, so a rule change is tested by adding a line there. Integration tests
load the built plugin (and a packed tarball) into the real opencode without calling a model. The e2e tests are
opt-in because they use a real model.

## Commits and pull requests

- [Conventional Commits](https://www.conventionalcommits.org), enforced by the `commit-msg` hook: `feat(rules): …`,
  `fix(analyze): …`, `docs: …`, `test: …`, `build: …`, `ci: …`, `chore: …`.
- One logical change per commit. A rule change and its `cases.json` entries go together.
- Update `CHANGELOG.md` for user-visible changes.
- The pre-commit hook (hk) runs prettier, oxlint, tsc, actionlint and whitespace checks; CI runs the same plus the
  tests. Please run `mise run check` before pushing.

## Reporting a bypass

If a command writes from a read-only agent without being blocked or asked about, open an issue with the command, the
agent, and the opencode version. Add it to [`rules/cases.json`](rules/cases.json) as a failing case if you can.

By contributing you agree that your work is released under the [MIT license](LICENSE).
