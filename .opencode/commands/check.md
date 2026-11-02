---
description: Run mise run check (lint, format, types, unit tests), then fix or report the failures
agent: build
---

Run `mise run check` from the repository root. It is what CI runs: oxlint, prettier --check, tsc and the unit tests.

If it passes, say so in one line and stop.

If it fails:

1. Group the failures by step (lint, fmt:check, typecheck, test) and read each error before changing anything.
2. Fix what is mechanical: formatting (`mise run fmt`), lint and type errors. For a failing unit test, find out
   whether the code or the expectation is wrong before you change either. Never skip a test, weaken an assertion, or
   delete or flip a case in `rules/cases.json` to make the suite pass: a changed verdict is a policy change, and the
   user decides on it.
3. Run `mise run check` again, until it passes or only failures you should not fix are left.
4. Report what failed, what you changed (`file:line`), and what is left with the reason.

Do not commit, and do not run `mise run build` or the integration and e2e tests unless asked (see AGENTS.md).

$ARGUMENTS
