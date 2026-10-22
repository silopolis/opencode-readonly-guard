# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Write guard for read-only agents (`plan`, `explore`, agents with `edit: deny`): blocks write redirections in any
  position, `tee` to files, file-modifying commands, `sed -i`, mutating git and package-manager commands and more,
  including behind wrappers and command substitutions.
- Shared, community-extensible rules in `rules/` (allowlist, always-ask flags, command classification, expected
  verdicts) with JSON Schemas.
- Event log of commands, blocks, prompts and answers for read-only agents.
- Reviewed learning: "always" answers become candidates; `/guard-review` and the `readonly_guard_review` /
  `readonly_guard_update` tools add vetted rules after an explicit confirmation of the exact pattern.
- `opencode-readonly-guard` command-line tool: `check`, `vet`, `rules`, `review`, `install`.
- Plugin options (`agents`, `allow`, `store`, `logDir`, `toast`, `command`).

[Unreleased]: https://github.com/silopolis/opencode-readonly-guard/commits/main
