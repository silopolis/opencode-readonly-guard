---
description: Add a command to the shared allowlist of read-only agents, following CONTRIBUTING.md
agent: build
---

Add this command to the shared allowlist of read-only agents: `$ARGUMENTS`

If no command was given, ask which one and stop. Work through "Adding a command to the allowlist" in
@CONTRIBUTING.md in order; the steps below say how to do each part in this repository.

1. **Research the write options before editing anything.** Read the command's own documentation (`--help`, the man
   page, the upstream docs for the installed version) and list every subcommand, option or configuration that writes
   or deletes files, changes local or remote state, or runs another program (`--output`, `-o FILE`, `-exec`, `--pre`,
   `-x`, `-i`, `--in-place`, `-delete`, pagers, hooks, plugins). Show the list with its sources. If no pattern can tell
   the read-only uses from the writing ones, say so and stop: not every command belongs on the allowlist.
2. **Check what the rules say today**, with the shared rules only:
   `bun src/cli.ts check --no-store '<command line>'` for typical and dangerous uses, and
   `bun src/cli.ts vet '<pattern>'` for each pattern you plan to add.
3. **Edit the rules:** the pattern with a short `reason` in `rules/allow.json`; each dangerous option in
   `rules/ask.json`; an unambiguous write in `src/analyze.ts` (a block) with a test in `test/unit/analyze.test.ts`;
   the `rtk …` form when the rtk plugin rewrites the command (`rtk rewrite '<command>'` shows it, if rtk is
   installed). Touch `rules/commands.json` only where CONTRIBUTING.md says so.
4. **Add cases to `rules/cases.json`:** at least one `allow`, and an `ask` or `block` case for every dangerous option
   from step 1.
5. **Run `mise run check`** and fix until it passes, then re-run the commands from step 2 to show the new verdicts.

Report the patterns added, each dangerous option and how it is handled (ask, block, or why the command is not
allowed), and the cases. Add a line to `CHANGELOG.md` under "Unreleased" (a new allowed command is a user-visible
change), propose a commit message such as `feat(rules): allow <command>`, and do not commit unless asked.
