# Session transcripts

Redacted transcripts of the maintainer's orchestration and work sessions with coding agents. They are history, not
documentation: they record what was tried and decided at the time, and may be wrong or superseded.
[README.md](../../README.md), [AGENTS.md](../../AGENTS.md), [CONTRIBUTING.md](../../CONTRIBUTING.md) and the code are
the source of truth.

## Naming

`YYYYMMDDHHMM-<slug>.md`: the start of the session, then a short lowercase slug with hyphens.

A session that is exported again after it went on (a long-running session, above all one that was compacted) gets
additional files, never a rewritten one: `YYYYMMDDHHMM-<slug>-p02.md`, `-p03.md`, and so on. The first file is part 1.
See "Continued sessions".

## Adding a transcript

1. Export the session with the fleet's session exporter (`export.py`, without `--sanitize`: that option replaces the
   whole content with placeholders), with `--out-dir` pointing to a directory of mode `0700` under
   `.state/<agent>/tmp/` (`install -d -m 0700 .state/<agent>/tmp/export`), never to this repository.
2. Redact it with the fleet's redactor in its `public` profile, for example
   `python3 ~/.config/nvim/scripts/session_redact.py --profile public < raw.md > memory/sessions/<name>.md`.
3. Run the redactor with `--check` from the repository root. It reads `.session-redact.toml` (settings only, no term)
   and exits 1 if anything is left in `memory/sessions/*.md`. This gate is local: the terms it uses are private, so CI
   cannot run it.
4. The maintainer reads the redacted file before it is committed.

The redactor hides names, not content: the text of a private repository's files that a tool printed into the session
goes through unchanged once the repository's name is hidden. Keep such output out of sessions you mean to publish, or
drop it from the export before step 2.

## Continued sessions: a re-export never overwrites a previous one

A published transcript is history: it is never rewritten, whether the session was compacted or not. When the same
session is exported again:

- find its latest part by the `**Session ID:**` line and the `<!-- session-export: through msg_... -->` marker in the
  first lines of the files;
- export from that marker with the exporter's `--since msg_...` (the bound is inclusive: the increment starts with the
  message of the marker) into the scratch directory, and name the result as the next part (`-pNN`);
- if the marker is already the newest message of the session, there is nothing to export;
- never use the exporter's `--force`, and never redirect redacted output over an existing file.

Each part is redacted and read like any other transcript, and carries the marker for the part after it.

## Why raw exports are never committed

A raw export holds what the redactor removes: secrets, private repository and host names, addresses, local paths and
personal data. The repository is public and Git history cannot be unpublished, so the only file that may reach a commit
is the redacted one. Delete raw exports once the redacted file is accepted; `.state/` and `.tmp/` are ignored by Git.

## Tooling

This directory is left alone by prettier and by the whitespace and newline hooks: a transcript keeps what the tools
printed, trailing spaces and very long lines included. The private key and merge conflict checks still apply. The npm
package publishes a whitelist of files (`files` in `package.json`) that does not include `memory/`.
