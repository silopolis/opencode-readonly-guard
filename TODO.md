# TODO

Open points for the plugin, roughly by importance. Rules to add are tracked by pull requests, not here.

## Release

- [ ] Publish to npm (`opencode-readonly-guard` is free). `publishConfig` already asks for provenance; add a release
      workflow (tag → CI → `npm publish --provenance`) and drop the "not published yet" notes from the README.
- [ ] Push the first tag (`v0.1.0`) and cut GitHub release notes from `CHANGELOG.md`.
- [ ] Test on older 1.18.x releases to confirm the `>=1.18.29` lower bound, and widen CI to a small opencode matrix.
- [ ] Submit the plugin to the opencode ecosystem list.

## opencode 2.x

- [ ] Port to the v2 plugin API (`Plugin.define({ id, setup })`) and ship both entrypoints from one default export
      (`server()` for v1, `setup()` for v2). V2 has `permission.hook("evaluate")`, `tool.hook("execute.before")`,
      `command.transform` and plugin storage, which would allow:
  - [ ] deciding in code (allow/ask/deny) instead of injecting glob rules, so `git -C <dir> status`, redirections
        on any pipeline stage and other things globs cannot express are handled exactly;
  - [ ] applying learned rules without a restart;
  - [ ] answering prompts with the analyzer's verdict;
  - [ ] allowing `--help` in code instead of the exact help layer. A general rule must not be `* --help`
        (`python3 -c CODE --help` and `bash -c CODE --help` run CODE). It needs, per program: where the global options
        and the subcommand path end, whether the program handles `--help` at that position before running anything
        (git only for `git <cmd> --help`, which it turns into `git help <cmd>`; clap programs and npm anywhere), and
        that no other argument runs or writes something. In practice an allowlist of programs with their help
        semantics, checked by the analyzer.
- [ ] Test against an installed opencode 2.x (the integration suite only knows 1.19.x).

## Policy and parser

- [ ] Replace the hand-written shell tokenizer with tree-sitter-bash (what opencode itself uses) or prove equivalence
      with a differential fuzz test against it.
- [ ] Interpreters that can write (`python -c`, `node -e`, `perl -e`, `ruby -e`, `awk`, `sqlite3 .shell/.output`):
      they prompt today because they are not on the allowlist, but a broad "always" opens them. Detect obvious write
      APIs, or refuse to learn wildcards for them (already the case) and say so in the prompt.
- [ ] `git -C <dir> …`, `git --no-pager …`: globs cannot express "global options, then a read-only subcommand".
      Normalize the command in the analyzer and decide there once the v2 hook is available.
- [ ] Build tools that write by design (`make`, `cargo build`, `go build`, `docker build`): decide whether to
      classify them as writes (block) instead of prompting.
- [ ] Review an alternative path: wrap the commands our workflows strictly need (for example the few `herdr` and
      `git` forms an agent really uses) in our own thin, explicit commands, and allow those instead of the raw
      third-party CLIs. The allowlist(s) then name exactly what is permitted, rather than being derived from
      patterns, subcommand lists and "ask" overrides over a CLI we do not control (herdr and git add subcommands and
      flags with every release). Possible side benefits: it completes the CLI surface of the fleet's tools, and the
      same wrappers could later be exposed through MCP. Compare against the current rules on maintenance cost, on how
      much of the policy moves out of globs, and on what the agent loses by not typing the real command.
- [ ] Windows/PowerShell: nothing is parsed or tested.
- [ ] Cover non-bash tools in read-only agents (MCP tools with side effects, `webfetch` to internal hosts).
- [ ] Per-project allowlists (`.opencode/readonly-guard.json`) merged with the global one.
- [ ] More rules: `docker ps/images/logs`, `kubectl get/describe`, `gh pr view`, `systemctl status`, `journalctl`,
      `lsblk`, … each with its write flags in `ask.json` and cases in `cases.json`. Seen in sessions and left for
      later: `git grep` (`-O` runs a pager), `git check-ignore`, `git show-ref`, `git for-each-ref`,
      `git hash-object` (`-w` writes), exact `<tool> --version`, absolute paths (`/usr/bin/ls`), and the `2>&1` form of
      exact rules (opencode matches `herdr --help 2>&1` with its redirection).
- [ ] `$(…)` inside arithmetic (`(( $(cmd) ))`, `$(( $(cmd) ))`) is not analyzed: the tokenizer skips the body.
      opencode's own parser should still prompt for `cmd`, but the write guard does not see it.
- [ ] Classification gaps found in the log: `git history` and `git backfill` are not in `git.write`;
      `systemctl show-environment` and bare `mount` (both listings) are blocked.

## Sharing rules

- [ ] A command to contribute rule changes upstream: `opencode-readonly-guard submit` (also reachable from
      `/guard-review`). It would turn the user's learned rules, and the dismissed or refused ones worth discussing,
      into a diff against `rules/allow.json` / `ask.json` / `commands.json` plus matching `rules/cases.json` entries,
      run the schema and test checks, and open a pull request with `gh` against `origin` (or `upstream` when `origin`
      is a fork, creating the fork if needed). Every rule needs a `reason`, and nothing leaves the machine without a
      preview and a confirmation; the event log is never uploaded.

## Learning and review

- [ ] Check in a real TUI that the "always" warning toast is shown (only the API call is covered by tests).
- [ ] Make the review smarter: merge near-duplicate candidates, group by command, propose removals of unused rules.
- [ ] A `doctor` subcommand: show which agents are treated as read-only and the resolved rules.
- [ ] Event log: optional redaction (commands can contain secrets), configurable retention, file permissions 0600.

## Interplay with other plugins

- [ ] rtk: models retry commands the rtk plugin rewrote (`ls` → `rtk ls`) because they think they mistyped them.
      Options: tell the model in the tool description, skip the rewrite in read-only agents, or fix upstream.
- [ ] Warn at startup when another plugin also injects bash rules.

## Loading

- [ ] Guarantee the plugin runs once per opencode process. Today a global and a project entry (or a `plugins/` copy
      plus an npm entry) load two instances that both inject rules, register the tools and log every event twice.
      Add a process-wide guard (for example a `globalThis` symbol set by the first instance) and decide which
      instance wins: if a global instance is already loaded and the project config also lists the plugin, the
      project's options should take effect (re-run the config injection with the project's options, replacing the
      global instance's rules) rather than being ignored. Cover it with an integration test that loads both.
- [x] Load without the runtime dependency: when loaded from a path, the plugin must not need `@opencode-ai/plugin` in
      a `node_modules`. The build bundles it (and zod) into `dist/index.js`; opencode's other way, plain JSON Schema
      tool arguments, is a legacy path that makes every argument required and validates none.
- [ ] Detect and report a plugin that fails to load instead of being dropped silently (for example a startup
      self-check, or documented `doctor` output). opencode logs nothing about it, even at `DEBUG`.
- [x] Add an integration test that loads the built plugin from a directory without `node_modules` (the packed
      tarball, unpacked as is).

## Repository

- [x] opencode project config for contributors: an `AGENTS.md` with the commands and conventions, `opencode.json`
      with a `permission` setup that allows the check tasks and read-only `git`/`gh`, and the project commands
      `/check` and `/add-rule` in `.opencode/commands/`.
  - [ ] Load the repository's own plugin from `dist/` for dogfooding. Waits for "Loading": a contributor who already
        has the plugin globally would load it twice.
- [x] Automated dependency updates: Renovate (`renovate.json`; Dependabot handles neither `mise.toml` nor bun) for
      npm and `bun.lock`, `mise.toml` (opencode included), `hk.pkl` and the GitHub Actions (pinned to SHAs), with
      grouped minor/patch updates and `build(deps):` / `ci(deps):` commits.
  - [ ] Enable the Renovate GitHub app on the repository, then merge its first "opencode" pull request (the pinned
        opencode bump) once `mise run test:integration` passes against it.

## Testing

- [ ] Deterministic e2e: a mock OpenAI-compatible provider that returns scripted tool calls, so CI can drive a real
      opencode through block / ask / always / review without credentials.
- [ ] Cover the TUI path of `/guard-review` (question tool, confirmation prompt) with a recorded session.
- [ ] Differential tests: run the cases through opencode's own permission evaluation (`opencode debug agent`) and
      compare with `decide()`.

## Upstream (opencode)

Worth an issue each, with the reproduction in the README findings:

- [ ] `permission.ask` plugin hook is declared and documented but never called (1.19.3).
- [ ] "Always" is process-wide, not per agent or session, outranks `ask`/`deny`, is not persisted, and derives
      `prog *` for programs missing from the arity table (e.g. wrappers such as `rtk`).
- [ ] Redirections are dropped from the matched text for later pipeline stages, groups and subshells.
- [ ] v1 SDK types lag the runtime (`permission.asked`, `session.agent`).
