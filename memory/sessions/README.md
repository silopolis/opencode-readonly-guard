# Session transcripts

Redacted transcripts of the maintainer's orchestration and work sessions with coding agents. They are history, not
documentation: they record what was tried and decided at the time, and may be wrong or superseded.
[README.md](../../README.md), [AGENTS.md](../../AGENTS.md), [CONTRIBUTING.md](../../CONTRIBUTING.md) and the code are
the source of truth.

## Naming

`YYYYMMDDHHMM-<slug>.md`: the start of the session, then a short lowercase slug with hyphens.

## Adding a transcript

1. Export the session with the fleet's session exporter (`export.py --sanitize`), with `--out-dir` pointing to a
   directory of mode `0700` under `.state/<agent>/tmp/` (`install -d -m 0700 .state/<agent>/tmp/export`), never to this
   repository.
2. Redact it with the fleet's redactor in its `public` profile, for example
   `python3 ~/.config/nvim/scripts/session_redact.py --profile public < raw.md > memory/sessions/<name>.md`.
3. Run the redactor with `--check` from the repository root. It reads `.session-redact.toml` (settings only, no term)
   and exits 1 if anything is left in `memory/sessions/*.md`. This gate is local: the terms it uses are private, so CI
   cannot run it.
4. The maintainer reads the redacted file before it is committed.

## Why raw exports are never committed

A raw export holds what the redactor removes: secrets, private repository and host names, addresses, local paths and
personal data. The repository is public and Git history cannot be unpublished, so the only file that may reach a commit
is the redacted one. Delete raw exports once the redacted file is accepted; `.state/` and `.tmp/` are ignored by Git.

## Tooling

This directory is left alone by prettier and by the whitespace and newline hooks: a transcript keeps what the tools
printed, trailing spaces and very long lines included. The private key and merge conflict checks still apply. The npm
package publishes a whitelist of files (`files` in `package.json`) that does not include `memory/`.
