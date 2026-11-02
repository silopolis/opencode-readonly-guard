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
- herdr rules: read-only `herdr` commands (`agent list`, `pane read`, `status`, …) are allowed in read-only agents;
  every other subcommand always asks and cannot be learned; `update`, `worktree create|remove`,
  `integration install|uninstall`, `session delete`, `plugin install|update`, `api schema --output` and `pane run` of a
  writing command are blocked.
- The `herdr-ui` preset: `herdr tab rename` and `herdr notification show`, which only change what herdr displays, are
  allowed when opencode runs in a herdr pane (`HERDR_ENV=1`) and not elsewhere. Switch it off with
  `"presets": { "herdr-ui": false }` in the plugin options, the store or herdr's own `readonly-guard.json` (in the
  directory of `HERDR_CONFIG_PATH`, else `$XDG_CONFIG_HOME/herdr`; read only inside herdr, never written, the last
  source wins); `allow` patterns from these sources pass the same safety check. UI commands listed by the user only
  take effect inside herdr. The `init` log event gains the `presets` in effect.

[Unreleased]: https://github.com/silopolis/opencode-readonly-guard/commits/main
