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
command. The **last matching rule wins**, which is why `ask.json` is applied after every allow rule (only the exact
`--help` commands of the help layer follow it).

### Adding a command to the allowlist

An allow rule must be safe in **every** use the pattern can match, not just the common one.

1. Look for options that write files, delete, or run other programs (`--output`, `-o FILE`, `-exec`, `--pre`, `-x`,
   `-i`, `--in-place`, `-delete`, …), and for operands that do (`uniq IN OUT`, `date MMDDhhmm`, `hostname NAME`). If
   any exists, either do not allow the command, or add the dangerous option to `ask.json` (a prompt) and, if it is
   unambiguous, to the analyzer in `src/analyze.ts` (a block). Remember that GNU tools and git accept any unambiguous
   abbreviation of a long option (`sort --out=f`, `git branch --edit-desc`) and bundled short options (`-uo f`): the
   analyzer must catch those, and an `ask.json` glob should start from the shortest accepted prefix
   (`sort *--co*` for `--compress-program`).
2. Add the pattern and a short `reason` to `allow.json`. Use `cmd *` for "any arguments", `cmd sub*` for a family of
   subcommands, and the exact text for a single use. When the bare subcommand writes (`git branch NAME`,
   `mise settings KEY VALUE`), allow only the exact listing and the forms that cannot write (`git branch -a *`), and
   check the program's own behaviour: `git branch -v NAME` creates a branch, `git branch -a NAME` is refused.
3. If the command is reached through the rtk plugin (`rtk rewrite '<command>'` shows it), add the `rtk …` form too; a
   unit test checks this for the commands rtk rewrites.
4. Add cases to `cases.json`: at least one `allow`, plus an `ask` or `block` case for each dangerous option.
5. Run `mise run check`.

Other files:

- **`commands.json` → `hardWrite`:** commands that modify files whatever their arguments. They are blocked.
- **`commands.json` → `packageManagers`, `git`:** which subcommands write, and which git subcommands may get a
  wildcard rule from `/guard-review`.
- **`commands.json` → `herdr`:** `help` (printed help, allowed only as exact commands), `read` (read-only
  subcommands, a wildcard may follow), `ui` (what the `herdr-ui` preset in `src/sources.ts` allows inside herdr;
  never in `allow.json`) and `write` (blocked). Any other herdr subcommand must be added to `ask.json` as `herdr <sub> *`;
  there is no catch-all, because a `herdr *` ask rule would also silence the allowed reads. Keep the four lists
  disjoint and `allow.json` in step with `help` and `read` (the unit tests check both).
- **`commands.json` → `environment`:** `exportSafe`, the variables that may be exported or assigned because they only
  select a language, a format or turn a behaviour off, whatever their value (`LC_*` is a prefix); and `alwaysExported`,
  the variables the guard treats as exported even when the plugin's own environment lacks them. opencode never prompts
  for `export`, `declare` or a bare `NAME=value`, so only add a variable to `exportSafe` if no value of it can make a
  later command run or write something.
- **`commands.json` → `containers`:** the docker and podman `read` paths (`allow.json` must have
  `<engine> <path> *` for each, the unit tests check it) and the `write` paths the guard blocks. Allow rules start
  with the subcommand, so global options that pick another daemon (`-H`, `--context`) never match them.
- **`commands.json` → `subcommandHelp`:** extra git subcommands, and npm and mise subcommand paths, whose exact
  `<program> <subcommand> --help` is allowed by the help layer, after `ask.json` (git also gets `git.write` and
  `git.read`, herdr its `read` and `write` paths and its `herdr <path> *` ask rules; git, npm and mise get the `rtk`
  form). The write guard treats a sole trailing `--help` after the subcommand path as a help request. The unit tests
  check that every derived command is allowed and that none matches an ask-listed flag.
- **`commands.json` → `wildcardSafe`:** commands for which `/guard-review` may offer `cmd *`. Only add a command whose
  every read-only use is harmless and whose write options are covered by `ask.json` or the analyzer.

Behaviour that depends on arguments (`tee`, `sed -i`, `find -exec`, `curl -o`, `git branch <name>`, …) lives in
`src/analyze.ts`, and for system tools with their own option rules (`systemctl`, `journalctl`, `ip`, `pacman`,
`docker`/`podman`, `virsh`) in `src/programs.ts`; add a unit test in `test/unit/analyze.test.ts` and a case in
`cases.json`. Check the program's real behaviour (its sources, or a run against a scratch target such as
`virsh -c test:///default`) rather than its manual alone.

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

## Dependency updates

[Renovate](https://docs.renovatebot.com) (`renovate.json`) opens the update pull requests once a week: npm packages
with `bun.lock`, the tools in `mise.toml`, the hk version in `hk.pkl`, and the GitHub Actions, pinned to commit SHAs.
Minor and patch updates are grouped into one pull request, majors come one by one, Actions have their own group, and
commits are `build(deps): …` or `ci(deps): …`. The supported ranges (`peerDependencies`, `engines`) are left alone.

opencode (`aqua:anomalyco/opencode` in `mise.toml`) and `@opencode-ai/plugin` come together in an "opencode" pull
request and stay below 2.0. CI runs the integration tests against the new version; run `mise run test:integration`
locally as well before merging, and update "Tested with opencode …" in the README once it passes.

## Reporting a bypass

If a command writes from a read-only agent without being blocked or asked about, open an issue with the command, the
agent, and the opencode version. Add it to [`rules/cases.json`](rules/cases.json) as a failing case if you can.

By contributing you agree that your work is released under the [MIT license](LICENSE).
