# Map darse/amiraute upstream fit (@explore subagent)
**Session ID:** ses_e1c781a70ffeB23Qjne9LbenhM
**Parent Session ID:** ses_e6320a0e1ffexOEYp4Zi3QELSa
**Created:** 11/16/2026, 9:44:56 AM
**Updated:** 11/16/2026, 9:47:28 AM
<!-- session-export: through msg_1e389caf0001atTchpNP52BpqW -->
<!-- session-children: -->

---

## User

RESEARCH ONLY: do not edit, create or delete any file, do not run git commands that write, do not print environment variables. Thoroughness: medium.

Context: an orchestrator agent ran a fleet of opencode worker agents for the repository [redacted:repo] (soon renamed opencode-agent-policy). It built private helper tools and conventions, and the maintainer wants to know which of them could be "upstreamed" into the fleet's other repositories, mainly darse ([redacted:repo], the project factory: Copier templates, conventions, decision records) and possibly others. Also find whether any fleet repository is meant to hold opencode / agent-harness tooling.

Candidates to place (names and one-line roles):
1. launch-worker.sh / retire-worker.sh: start a worker agent in its own git worktree + herdr workspace, copy input files, send its brief with verify/resend; retire = refuse if dirty/unpushed, harvest .state/<agent>/, remove worktree and workspace.
2. watch / once / lib-once.sh / peek: poll worker panes, answer opencode permission dialogs with a verified "Allow once" only when a command passes a read-only policy check.
3. export-sessions.sh: export opencode sessions to markdown with a fleet exporter (istc), redact with a fleet redactor (nvim repo), scrub NUL bytes and extra terms, verify, for committing to memory/sessions/.
4. deploy-main.sh: rebuild a checkout's dist/ that live sessions load, in a scratch clone, with tests, spot checks, atomic swap and rollback.
5. make-brief.sh + brief template: worker brief = header (where you work, private .state area, secrets rule, process: PLAN then wait for go, report format) + task.
6. The ".state/<agent>/ (durable) and .state/<agent>/tmp/ (scratch)" convention, ignored by git.
7. The research-worker pattern: read-only worker that replies with a plan, gets a go, writes report.md + evidence/ + prototype/, no PR.
8. A session "re-root" tool: rewrite opencode.db paths (project.worktree, session.directory) when a project folder is renamed.
9. A test-harness hazard fix: a sandbox helper must not pass the caller's credentials to child processes (a denylist of secret-looking env var names), plus scrubbing GIT_* variables in tests run from git hooks.
10. A scripted OpenAI-compatible mock provider to drive real opencode in tests without a model.

What to search and report:
A. In [redacted:repo]: what darse already provides or plans for each of the 10 candidates (exact file paths, DR-NNN or T-NNN/B-NNN ids, one line each). Look at README.md, AGENTS.md, spec/drs/, spec/contracts/, project/roadmap.md, project/TODO.md (backlog B-NNN), project/tasks/, template/, docs/. Search terms: herdr, orchestrat, worker, worktree, session export, memory/sessions, redact, .state, brief, permission, opencode, harness, mock provider, sandbox.
B. Which fleet repositories are described and what each owns: look at [redacted:repo] (spec/01-portfolio.md or similar portfolio/ecosystem specs, DR-001 four-layer model) and the AGENTS.md of [redacted:repo], [redacted:repo], [redacted:repo], ~/Work/[redacted:private]. Is there any existing or planned repository for opencode tooling, agent-harness tooling, or orchestration tooling? Quote the line and path.
C. For each of the 10 candidates, your best fit: darse (template or convention), istc, the nvim redactor, cles-en-main (cem), a NEW repository, or stay private. One line of reasoning each, citing what you found.

Return a compact answer (max ~80 lines): tables preferred, with paths and ids. Do not quote private data such as hostnames, tokens or personal names beyond repository names. If something is not found, say "not found" rather than guessing.

---

## Assistant (Explore · Claude Sonnet 5.5 · 90.6s)

**Tool: bash**

**Input:**
```json
{
  "command": "cd ~/Work && rtk ls; rtk ls darse darse/spec darse/spec/drs darse/spec/contracts darse/project darse/project/tasks darse/docs 2>&1 | head -150"
}
```

**Output:**
```
Courses/
amiraute/
[redacted:repo]/
[redacted:repo]/
cles-en-main/
darse/
[redacted:repo]/
istc/
[redacted:private]/
[redacted:private]-prep/
[redacted:private]/
opencode-readonly-guard/
test_try/
trees/
tries/
docs/
memory/
project/
scripts/
spec/
template/
tests/
milestones/
tasks/
contracts/
drs/
AGENTS.md  9.9K
LICENSE  1.0K
README.md  2.9K
copier.yml  3.8K
hk.pkl  3.4K
mise.toml  3.0K
pyproject.toml  521B
uv.lock  19.3K
README.md  1.3K
_quarto.yml  827B
add-a-template-module.md  8.0K
index.md  1.3K
laying-down-a-project.md  10.5K
reference-commands.md  7.5K
reference-quality-module.md  5.1K
TODO.md  7.2K
roadmap.md  112.6K
README.md  11.5K
T-001-import_governing_specs.md  7.3K
T-002-template_skeleton_and_red_harness.md  15.9K
T-003-core_runtime_quality_to_green.md  9.2K
T-004-release_task_machinery.md  7.5K
T-005-piloting_and_docs_norms.md  5.8K
T-006-index_and_roadmap_refit.md  4.8K
T-007-docs_scaffold_and_readme_status.md  5.2K
T-008-pilotage_open_m003.md  5.2K
T-009-corrective_norms.md  14.8K
T-010-backlog_and_agents_context.md  6.6K
T-011-mise_file_task_migration.md  7.5K
T-012-pilotage_close_m003.md  6.4K
T-013-dr000_reimport_review.md  18.6K
T-014-changelog_ordering_check_signal.md  6.8K
T-015-pilotage_open_m004.md  4.6K
T-016-methodology_loop_norms.md  11.8K
T-017-python_tooling_foundation.md  10.0K
T-018-traceability_checker.md  10.5K
T-019-coverage_closure_ct001_ct002.md  9.0K
T-020-coverage_closure_ct004.md  10.5K
T-021-pilotage_close_m004.md  7.7K
... (89 more, 8 filtered)
[+97 hidden: rtk recall 905bbc0f2890abec]

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd ~/Work && rg -il 'herdr|orchestrat|worktree|opencode|memory/sessions|\\.state|harness|mock provider' darse amiraute cles-en-main istc [redacted:private] --glob '!node_modules' --glob '!.git' 2>/dev/null | head -80"
}
```

**Output:**
```
darse/AGENTS.md
istc/validate-debt.toml
darse/mise.toml
istc/README.md
darse/README.md
istc/CONTRIBUTING.md
istc/AGENTS.md
istc/memory/studies/orchestration_sessions_herdr/log.md
istc/mise.toml
cles-en-main/README.md
istc/lychee.toml
istc/memory/studies/orchestration_sessions_herdr/index.md
cles-en-main/AGENTS.md
istc/hk.pkl
istc/memory/studies/orchestration_sessions_herdr/rapport.md
darse/tests/test_secrets.py
istc/memory/studies/README.md
istc/cncf.md
darse/tests/test_roundtrip.py
darse/tests/generated_projects.py
[redacted:private]/hk.pkl
[redacted:private]/biome.jsonc
[redacted:private]/AGENTS.md
darse/tests/test_quality_module.py
istc/memory/studies/spike_backpass/rapport.md
[redacted:private]/README.md
cles-en-main/docs/how-to/cem_command.md
istc/memory/studies/spike_backpass/index.md
darse/tests/README.md
istc/memory/studies/remesure_m026/rapport.md
istc/memory/studies/remesure_m026/log.md
[redacted:private]/scripts/session/export.py
[redacted:private]/spec/drs/DR-005-emergency_access_alerts_and_memory_guard.md
istc/tests/test_exports_layer_t279b.py
istc/tests/test_exports_definitions_t279b.py
cles-en-main/tests/unit/test_cem_android_capture.py
darse/tests/lib/py/test_corpus.py
cles-en-main/scripts/cem/android.py
cles-en-main/tests/unit/test_cem_android_adb.py
istc/memory/studies/remesure_m026/scripts/mesure5.py
istc/tests/test_session_texts_t279b.py
[redacted:private]/spec/drs/DR-001-repository_topology_and_data_flow.md
istc/memory/studies/remesure_m026/scripts/mesure3_extract.py
istc/tests/test_session_naming_t279b.py
[redacted:private]/memory/sessions/202611100958-T-001_T-003-black_screen_planning_and_bootstrap.md
istc/tests/test_worktree.py
istc/memory/studies/remesure_m026/scripts/mesure12.py
[redacted:private]/project/tasks/T-025-[redacted:private]_580_driver.md
istc/memory/studies/remesure_m026/scripts/common.py
cles-en-main/spec/drs/README.md
[redacted:private]/project/tasks/T-023-hybrid_graphics_evaluation.md
cles-en-main/tests/e2e/archive/test_archive_aliases.py
darse/tests/check/test_sembr.py
[redacted:private]/project/tasks/T-021-targeted_[redacted:private].md
cles-en-main/scripts/lib/py/cles_en_main/android/adb.py
cles-en-main/tests/e2e/android/helpers_android.py
cles-en-main/spec/drs/DR-000-principles_and_methodology.md
istc/memory/studies/remesure_m026/data/orphelins_24dfb14.csv
cles-en-main/spec/drs/DR-008-agent_steering.md
cles-en-main/ruff.toml
cles-en-main/spec/drs/DR-004-thin_tasks_cli_domain_libraries.md
cles-en-main/hk.pkl
cles-en-main/biome.jsonc
cles-en-main/spec/drs/DR-009-static_validation_and_secret_guard.md
cles-en-main/tombi.toml
istc/memory/studies/releve_format_sessions/rapport.md
cles-en-main/spec/drs/DR-007-opencode_generations_and_database_merge.md
[redacted:private]/machines/[redacted:private]/data/2026-11-10-incident_evidence/incident1/oom_kills.txt
cles-en-main/spec/drs/DR-006-logging_and_telemetry.md
[redacted:private]/project/tasks/T-010-reproduction_on_kernel_7_0_12.md
istc/memory/studies/releve_format_sessions/log.md
istc/tests/test_staged_typography_merge_t231.py
[redacted:private]/project/tasks/T-009-reproduction_on_kernel_7_1_5.md
istc/memory/studies/releve_format_sessions/index.md
istc/tests/test_staged_pilotage_t218.py
[redacted:private]/project/tasks/T-008-emergency_access.md
istc/tests/test_slug_budget.py
darse/template/tombi.toml
istc/memory/studies/releve_format_sessions/scripts/releve.py
istc/tests/test_session_layer_t279a.py

```


---

## Assistant (Explore · Claude Sonnet 5.5 · 3.2s)

**Tool: bash**

**Input:**
```json
{
  "command": "cd [redacted:repo] && rtk rg -n -i 'herdr|orchestrat|worktree|opencode|memory/sessions|\\.state|redact|harness|mock|sandbox|brief|worker' AGENTS.md README.md project/TODO.md docs/*.md | head -80; rtk ls spec/drs spec/contracts memory template | head -80"
}
```

**Output:**
```
docs/reference-quality-module.md:39:  It is in no hook and no dependency of `validate`, and it is not `mise run fix:secrets`, the separate redaction task.
docs/reference-quality-module.md:51:| `memory/sessions/**` | every format step, `trailing_whitespace`, `check_added_large_files`, `check_merge_conflict` | raw provenance (session exports), often over 500 KB, may quote conflict markers | each tool's own configuration when it honours it for named files, otherwise an `exclude` on the hk step |
docs/reference-quality-module.md:54:- `memory/sessions/**` is not left out of the secret scan, the secret-shaped path refusal or `detect_private_key` (`CT-011`).
docs/add-a-template-module.md:31:A question needs a default: the round-trip harness (step 6) always runs `copier` with `--defaults`.
docs/add-a-template-module.md:120:`tests/test_roundtrip.py` copies the whole repository, including any uncommitted change, into a throwaway temp directory, git-initializes and tags it there, then runs a real `copier copy`/`copier update` cycle against that copy (never against this repository's own working tree directly, harness isolation rule).
project/TODO.md:4:Kanban board for darse's own dispatched or self-initiated tasks (`project/tasks/T-NNN-slug.md`) and milestones (`project/milestones/M-NNN-slug.md`), per `DR-010` §Task briefs and piloting files.
project/TODO.md:23:- [ ] **T-071** - Fresh worktree or clone: test:roundtrip fails until the Python environment is synced
project/TODO.md:39:- [!] **T-069** - Per-task worktrees and herdr orchestration: norm, naming, `.state/` and close path, interim fleet signals
project/TODO.md:51:- [x] **T-002** - Template skeleton and red round-trip harness
project/TODO.md:52:- [x] **T-003** - Build core, runtime, quality modules until the harness is green
project/TODO.md:54:- [x] **M-001** - M1: round-trip harness and skeleton
project/TODO.md:82:- [x] **T-030** - Root copier.yml packaging fix, CT-001/CT-002 amendments, test-first harness rework
project/TODO.md:90:- [x] **T-036** - check:index worker, CT-007 accepted, test_ct007_rn coverage, not yet wired
project/TODO.md:116:- [x] **T-063** - Secret scanning, secret-shaped path filtering and redaction: template quality module and darse's own hooks
project/TODO.md:119:- [x] **T-068** - Adopt .state/ as the git-ignored home of orchestration state (interim layout, micro-task)
docs/reference-commands.md:14:Darse carries no slash-command catalog of `[redacted:private]`'s own scale: six thin `.opencode/command/*.md` wrappers only (`docs.md`, `docs-build.md`, `docs-preview.md`, `docs-clean.md`, `publish-local.md`, `DR-020` §Agent interface).
docs/reference-commands.md:21:| `mise run validate` | Full check gate (lint, the secret guard, requirement-to-test traceability, index and command-catalog coherence, the update round-trip harness): darse's own Definition-of-Done gate (`DR-014`). Run it as `mise run -c validate` (`--continue-on-error`, before the task name): every check finishes, each red one is reported and `test:roundtrip` prints its count, with the exit status still non-zero; plain `mise run validate` stops at the first red check. |
docs/reference-commands.md:27:| `mise run lint:secrets` | Secret guard over the whole tree (`DR-025`, `CT-011`): `hk check --all` runs the content scan (betterleaks with `.betterleaks.toml`, inline `betterleaks:allow` markers honoured) and the secret-shaped path refusal on every file git lists, `memory/sessions/**` included. Check only; wired into `validate`. |
docs/reference-commands.md:29:| `mise run fix:secrets [PATHS...] [--apply]` | Secret redaction (`CT-011.R11`-`R14`): a dry run listing `path:line:column: rule (n bytes)`, never the secret; `--apply` replaces each secret with `[REDACTED:<rule>]` and leaves every other byte, all-or-nothing (a finding that cannot be located exactly, or that overlaps another, makes it write nothing and exit 2). Covers the git-listed files, or the named ones. One implementation, the template's `template/.mise/tasks/fix/secrets`. Not wired into `validate` and never a hook. Exit status 1 after a dry run that found something is the report, not a failure of the tool. |
docs/reference-commands.md:41:| `mise run session:export` | Export the current session to `memory/sessions/` (manual today). |
docs/reference-commands.md:43:| `mise run test:roundtrip` | Update round-trip harness (`CT-003.R01`-`R04`, `CT-001.R05`): asserts `DR-003`'s four path-lifecycle classes against a real, throwaway-tagged Copier round trip; also carries `scripts/lib/py/` and every checker's own unit tests. Wired into `validate`. |
README.md:19:| `tests/` | the update round-trip harness (`mise run test:roundtrip`, `CT-003.R01`-`R04`/`R05` plus two doctrine checks), asserted against a real, throwaway-tagged Copier round trip of the whole repo, never darse's own working tree, green since `T-003` |
README.md:28:mise run -c validate  # lint + link + xrepo + prose + SemBr + secrets + traceability + index and command-catalog coherence + round-trip harness (DoD gate; -c reports every red check)
AGENTS.md:20:- `DR-010` §Task briefs and piloting files, `DR-021` (piloting file and index formats): brief/record/index anatomy, read before authoring or amending any milestone, task or index README.
AGENTS.md:41:  - Milestone task decomposition (`DR-018` v1.1.0): opening pilotage task (record plus every content task record `ready`, no business content) / self-sufficient content tasks (`DR-010` brief anatomy in full) / closing pilotage task (sweep, review gate, merge, session export); a milestone branch's first commit is the pilotage commit, its closing commit the carrier merge.
AGENTS.md:46:- A dispatch this repo receives states a return signal (`DR-015`); a fleet session writing here follows the boarding protocol: read this file first, obey darse's own conventions, `validate` green before any commit, dispatch origin carried in the record or commit, board updated in the same session, session export to `memory/sessions/` (`DR-016`).
AGENTS.md:47:- New DR/CT files follow `DR-010`'s conventions (front matter, ID sequence, status lifecycle, changelog section); milestone/task records follow `DR-010` §Task briefs and piloting files.
AGENTS.md:49:  - A session export (`memory/sessions/**`) is scanned and redacted before it is committed: run `mise run fix:secrets`, review the `--apply` diff, rotate any secret that was ever live.
AGENTS.md:50:  - The `pre-commit` hook (`mise run hooks:install` installs it) and `validate` (`lint:secrets`) only check and refuse; redaction is deliberate, never a hook.
AGENTS.md:77:- `mise run session:export`: transitional, exports the current session to `memory/sessions/` (manual today).
AGENTS.md:78:- `mise run fix:secrets [--apply] [paths...]`: secret redaction, a dry run unless `--apply` (all-or-nothing); run it on a session export before committing it (`CT-011`).
AGENTS.md:88:Consulted on demand only: `memory/sessions/` (session transcripts).
docs/laying-down-a-project.md:58:- **Template-owned** (re-rendered on every `copier update`): `.editorconfig`, `.gitignore`, `mise.toml` (composed from the chosen modules' own `[env]`/`[tools]`/`[tasks]` slices), and, rendered only because Priya kept `quality` selected, `hk.pkl`, `.betterleaks.toml` (the secret scanner's configuration), `.mise/tasks/fix/secrets` (the redaction task, below) and the configuration files of the format checks (`.markdownlint-cli2.yaml`, `tombi.toml`, `.ryl.toml`, `.shellcheckrc`, `ruff.toml`, `biome.jsonc`, below).
docs/laying-down-a-project.md:91:`memory/sessions/**`, the session exports, is left out of every format check but not out of the secret scan below.
docs/laying-down-a-project.md:93:The same gate is also the project's secret guard (`spec/drs/DR-025-secret_scanning_path_refusal_and_redaction.md`, `spec/contracts/CT-011-secret_guard_requirements.md`).
docs/laying-down-a-project.md:96:`memory/sessions/**` is scanned like any other path.
docs/laying-down-a-project.md:98:Redaction is the deliberate counterpart, never a hook.
docs/laying-down-a-project.md:99:Run `mise run fix:secrets` on a session export before committing it: it lists every finding (file, line, column, rule, never the secret), and `mise run fix:secrets --apply` rewrites each secret into `[REDACTED:<rule>]` and nothing else.
docs/laying-down-a-project.md:101:Review the diff, and rotate any secret that was ever live: redaction cleans the file, not the secret.
sessions/
copier/
includes/
CT-001-repo_blueprint.md  6.8K
CT-002-template_blueprint.md  3.5K
CT-003-path_lifecycle_requirements.md  2.9K
CT-004-module_interface.md  4.2K
CT-005-traceability_requirements.md  7.6K
CT-006-import_pin_requirements.md  6.7K
CT-007-index_coherence_requirements.md  10.0K
CT-008-command_catalog_coherence_requirements.md  6.2K
CT-009-sembr_guard_requirements.md  7.5K
CT-010-static_validation_requirements.md  16.4K
CT-011-secret_guard_requirements.md  13.2K
README.md  2.5K
DR-001-engine_choice_copier.md  4.6K
DR-002-composition_model.md  2.3K
DR-003-path_lifecycle_doctrine.md  3.2K
DR-004-extension_point_contract.md  2.4K
DR-005-module_taxonomy_v0.md  3.1K
DR-006-versioning_and_migrations_policy.md  3.1K
DR-007-identity_data_flow.md  1.7K
DR-008-stack_defaults.md  4.4K
DR-009-spec_import_model.md  13.0K
DR-010-artifact_conventions.md  25.1K
DR-011-conventions_selection.md  17.3K
DR-012-cross_repo_reference_scheme.md  9.5K
DR-013-ast_first_machinery.md  5.8K
DR-014-methodology_loop.md  10.7K
DR-015-fleet_status_propagation.md  7.0K
DR-016-cross_repo_execution_and_dispatch_model.md  6.1K
DR-017-git_branch_and_merge_model.md  7.5K
DR-018-milestone_record_format.md  14.2K
DR-019-readmes_role_and_content.md  6.1K
DR-020-docs_structure_and_publication.md  11.8K
DR-021-piloting_and_index_formats.md  13.7K
DR-022-environment_tools_and_tasks.md  13.9K
DR-023-cross_repo_anchoring_doctrine.md  12.7K
DR-024-static_validation_of_text_formats.md  8.7K
DR-025-secret_scanning_path_refusal_and_redaction.md  7.2K
README.md  4.5K
AGENTS.md.jinja  1.5K
LICENSE  383B
README.md.jinja  382B
biome.jsonc  1.4K
hk.pkl  7.2K
mise.toml.jinja  1.6K
ruff.toml  1.3K
tombi.toml  1.2K
{{ _copier_conf.answers_file }}.jinja  80B
... (4 filtered)
[+4 hidden: rtk recall 2398ac5cb67a9a2e]

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd ~/Work && rtk ls amiraute amiraute/spec 2>&1 | head -40; rg -n -i 'herdr|orchestrat|opencode|harness|agent tooling|worker' amiraute --glob '*.md' -l | head -20"
}
```

**Output:**
```
assets/
memory/
project/
scripts/
spec/
contracts/
diagrams/
drs/
AGENTS.md  6.6K
README.md  1.3K
mermaid.config.json  26B
mise.toml  2.1K
ruff.toml  221B
00-vision.md  6.2K
01-portfolio.md  61.0K
02-fleet_status.md  29.5K
README.md  2.9K
... (3 filtered)
[+3 hidden: rtk recall aa3dc039e82759be]
amiraute/project/roadmap.md
amiraute/AGENTS.md
amiraute/spec/drs/DR-019-static_validation_of_text_formats.md
amiraute/project/TODO.md
amiraute/spec/02-fleet_status.md
amiraute/spec/drs/DR-003-methodology_loop.md
amiraute/spec/drs/DR-018-mise_file_task_layout.md
amiraute/spec/drs/DR-004-naming_and_repository_topology.md
amiraute/project/tasks/T-096-darse_interim_l0_parallel_execution_proposal.md
amiraute/spec/drs/DR-002-[redacted:repo]_articulation_and_phasing.md
amiraute/spec/01-portfolio.md
amiraute/project/milestones/M-002-istc_dispatch_responses.md
amiraute/spec/drs/DR-015-mcp_services_strategy.md
amiraute/spec/drs/DR-001-four_layer_ecosystem_model.md
amiraute/spec/drs/DR-010-conventions_selection.md
amiraute/spec/00-vision.md
amiraute/spec/drs/DR-000-spec_artifacts_conventions.md
amiraute/project/tasks/T-094-static_validation_of_text_formats.md
amiraute/memory/sessions/202608280526-adjudicate_dr_005_l4_gap_close_t_035.md
amiraute/memory/sessions/202609171603-t070-recon-istc.md

```


---

## Assistant (Explore · Claude Sonnet 5.5 · 3.1s)

**Tool: bash**

**Input:**
```json
{
  "command": "cd [redacted:repo] && sed -n 36,42p project/TODO.md; rtk rg -n 'T-069|T-068|B-0' project/TODO.md | head -40; ls project/tasks | rtk rg 'T-06[89]|T-07'; rtk rg -n -i 'herdr|\\.state|worktree|orchestr|session' project/roadmap.md | head -50"
}
```

**Output:**
```

## Blocked

- [!] **T-069** - Per-task worktrees and herdr orchestration: norm, naming, `.state/` and close path, interim fleet signals


## Review
22:- [ ] **T-070** - Hook manager for parallel work: upgrade hk, or replace it (B-027)
25:- [ ] **T-058** - Re-import DR-017: [redacted:private]:ADR-201 1.19.0 to 1.24.0, session granularity (B-021)
26:- [ ] **T-059** - CT-007 extension: standalone-tasks list and changelog order (B-014, B-015)
39:- [!] **T-069** - Per-task worktrees and herdr orchestration: norm, naming, `.state/` and close path, interim fleet signals
76:- [x] **T-022** - DR-016 (amiraute anchoring doctrine): convergence verdict, B-001/B-006/B-007 discharge, re-import review
107:- [x] **T-053** - Command catalog reference and guard: resolve B-010
112:- [x] **T-056** - SemBr guard: fix the code-span blind spot, retrofit CT-009 (B-020, B-016)
113:- [x] **T-057** - Fix markdownlint nested ignores, measure validate failure masking (B-019, B-023)
119:- [x] **T-068** - Adopt .state/ as the git-ignored home of orchestration state (interim layout, micro-task)
T-068-state_dir_for_orchestration.md
T-069-per_task_worktrees_and_herdr_orchestration.md
T-070-hk_upgrade_or_replacement.md
T-071-fresh_worktree_setup_python_race.md
T-072-born_then_owned_file_updates.md
50 matches in 1 files:

50:> `M-009` (amiraute's own "M2" label) was assigned at registration (`amiraute...
166:Standalone tasks, out of any milestone: `T-001` (spec import, self-initiated,...
202:| 2026-08-28 | Task `T-039` registration completed on darse's own piloting su...
203:| 2026-08-28 | Task `T-040` registration completed on darse's own piloting su...
215:| 2026-09-07 | Task `T-047` opened and closed same session (`M-008` `0.3.0` w...
217:| 2026-09-08 | Task `T-048` registered and closed same session (`M-008` `0.4....
218:| 2026-09-08 | Task `T-049` registered and closed same session (`M-008` `0.5....
219:| 2026-09-08 | Task `T-049` reopened, user instruction: darse's first outward...
220:| 2026-09-08 | Task `T-050` registered and closed direct on `dev` (FYI-only s...
223:| 2026-09-08 | Task `T-051` registered and closed same session (`M-008` `0.6....
224:| 2026-09-09 | Task `T-052` registered and closed same session (`M-008` `0.7....
225:| 2026-09-09 | Task `T-053` registered and closed same session (`M-008` `0.8....
229:| 2026-09-22 | Task `T-055` registered and closed same session (Lane A dispat...
237:| 2026-10-15 | Backlog triaged ahead of `M-009` (deep review of `B-008` to `B...
241:| 2026-10-30 | Tasks `T-060` and `T-061` registered `ready` (Lane A dispatche...
242:| 2026-10-31 | Tasks `T-060` and `T-061` re-planned and `T-062` to `T-064` re...
243:| 2026-10-31 | Task `T-060` opened (`ready -> in-progress`, branch `task/T-06...
245:| 2026-10-31 | Task `T-062` opened (`ready -> in-progress`, branch `task/T-06...
247:| 2026-10-31 | Task `T-063` opened (`ready -> in-progress`, branch `task/T-06...
248:| 2026-10-31 | Task `T-065` registered `ready` (Lane A dispatch from `dotfile...
250:| 2026-11-02 | Task `T-061` opened (`ready -> in-progress`, branch `task/T-06...
251:| 2026-11-02 | Task `T-061` flipped `in-progress -> review` (`DR-018` review ...
253:| 2026-11-02 | Task `T-064` opened (`ready -> in-progress`, direct on `dev`, ...
254:| 2026-11-02 | Task `T-064` closed (direct on `dev`, target-rooted session `d...
255:| 2026-11-02 | Tasks `T-066` and `T-067` registered `ready`, `B-034` and `B-0...
  +25 more in project/roadmap.md [+25 hidden: rtk recall d47fba1556967595]

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd [redacted:repo] && rtk rg -n -i 'herdr|\\.state|orchestr' spec/drs/*.md spec/contracts/*.md template/AGENTS.md.jinja | head -50; rtk ls memory/sessions | tail -5; rtk ls .mise/tasks 2>/dev/null; rtk ls -a | head -40"
}
```

**Output:**
```
spec/drs/DR-020-docs_structure_and_publication.md:68:Narrow, traced re-adoption of part of what `1.0.0` dropped (`## Local adaptations` below): darse's own repo (never the generated template, never a consumer's own project) carries a minimal `docs-management` agent skill (`.opencode/skill/docs-management/SKILL.md`) plus five thin commands (`.opencode/command/docs.md`, `docs-build.md`, `docs-preview.md`, `docs-clean.md`, `publish-local.md`, the last added `1.2.0`, `T-051`), mirroring `[redacted:private]:ADR-115` §2's own docs-command family in shape (a thin wrapper per `mise run docs:*`/`publish:local` task plus one orchestrator command loading the skill), scoped strictly to `docs/` maintenance for this repo's own contributors.
202611022121-ses_e6256ba9cffebZLj63gGZYuZkC-T-066_T-067_nvim_request_intake.md  4.1K
202611031810-ORCH-coordination_push-explore_nvim_orchestration.md  548.1K
202611031810-ORCH-coordination_push-explore_readonly_guard.md  404.2K
202611080628-T-065-hook_output_and_enforcement.md  8.8K
README.md  769B
check/
docs/
fix/
hooks/
lint/
publish/
session/
setup/
test/
README.md  2.4K
release  1.1K
validate  725B
.git/
.mise/
.opencode/
.pytest_cache/
.ruff_cache/
.spell/
.state/
.venv/
dist/
docs/
memory/
project/
scripts/
spec/
template/
tests/
.betterleaks.toml  698B
.editorconfig  296B
.gitignore  741B
.markdownlint-cli2.yaml  1.5K
AGENTS.md  9.9K
LICENSE  1.0K
README.md  2.9K
copier.yml  3.8K
hk.pkl  3.4K
mise.toml  3.0K
pyproject.toml  521B
uv.lock  19.3K

```


---

## Assistant (Explore · Claude Sonnet 5.5 · 2.8s)

**Tool: bash**

**Input:**
```json
{
  "command": "cd [redacted:repo] && sed -n 1,60p project/tasks/T-069-per_task_worktrees_and_herdr_orchestration.md; echo ======; sed -n 1,50p project/tasks/T-068-state_dir_for_orchestration.md; rtk ls .mise/tasks/session; rtk ls .state"
}
```

**Output:**
```
---
id: T-069
title: "Per-task worktrees and herdr orchestration: norm, naming, .state/ and close path, interim fleet signals"
status: blocked
created: 2026-11-08
updated: 2026-11-08
depends_on: [T-058]
related_decisions:
  - id: DR-009
    role: depends_on
  - id: DR-016
    role: see_also
  - id: DR-017
    role: depends_on
  - id: DR-023
    role: see_also
related_specs: []
---

# T-069: per-task worktrees and herdr orchestration, a norm for darse and two signals to the fleet

## Goal

Make "each task runs in its own git worktree under `[redacted:worktrees_root]/`, with its own agent team, steered by a repo orchestrator through herdr" a norm of darse, written once with every finding of the session that produced it, and hand the fleet-wide part to the repositories that will own it.

Three deliverables:

- darse's own norm: an amendment of `DR-017` (worktree, sessions, close path) and, where the subject does not fit an import of `[redacted:private]:ADR-201`, a new `DR` for orchestration (naming, briefs, reporting, `.state/`); the choice of form is made at opening.
- darse's own close path, honouring `dev` as integration branch and `merged/<source>` as retention, which the global worktree tasks do not (see Context digest, Fit with darse).
- two outward Lane A signals, `amiraute` (an interim L0 decision record on what must be uniform across repositories) and `istc` (a request to include the engine design in its phase 8), each self-sufficient, `dispatch_origin: "darse:T-069"`.

It is blocked on `T-058`, which settles `DR-017` §Session granularity; both edit the same record.

## Context digest (self-sufficient: no prior session context required)

This digest is the lasting analysis of a long coordination session (the repo orchestrator `darse-orch`, opencode session `ses_e633b719cffeUqI3augjsl6tpc`, herdr pane `w9:pC`, 2026-11-07 and 2026-11-08).
`istc` is expected to port this practice into its phase 8 and, later, into `bosco`: nothing established there is left out, including what was not decided.
Facts are dated; re-measure anything about a moving target (`herdr`, `hk`, the sibling repositories) before relying on it.

### 1. Origin and the user's directions

- The user asked the repo orchestrator to coordinate darse and its herdr workspace, to push the unpushed state, to fix the stale registration of `T-065`, and then to run every task in its own worktree under `[redacted:worktrees_root]/`, using herdr's worktree feature in the `darse` workspace.
- The user asked to study two sibling experiments in multi-agent orchestration, `~/.config/nvim` (coordinator `nvim-orch`) and `[redacted:repo]` (coordinator `rog-orch`).
- User positions recorded during the session:
  - The fleet-wide rule probably belongs to `istc` phase 8 and then `bosco`; waiting for it could take days or months, so darse norms its own practice now and signals.
  - The global worktree tasks will eventually be moved or ported into `istc`/`bosco` during phase 8; they should take configuration parameters, not overrides.
  - A herdr or host agent name should be unique across a whole swarm and linked to repository, task, worktree and agent.
  - One task, one worktree, possibly several sessions (a task orchestrator and workers).
  - The integration branch is steered from the main checkout by the local orchestrator, who writes after the user's sign-off; how that fits a shared repository and a pull request workflow must be stated.
  - Briefs and agent state should find a home in a `.state/` directory (`T-068`), possibly moving into per-task directories (`istc:B-128`, in the manner of an OpenSpec change directory).
  - hk blocks parallel work and should be upgraded or replaced.
  - Debian, testing included, is stuck on git 2.53 and the user does not want to rely on a Homebrew git; legacy hook mode looks unavoidable unless a mise-managed git (`conda:git`) is light and fast enough.
  - The user's zsh configuration currently makes shell start-up very slow (it lengthens every new pane, see 4).
  - Every element of analysis, finding and decision of the session must reach `istc`, because it will build or port this into `bosco`.

### 2. Layering (who owns what)

- `amiraute:DR-001`: L0 coordination (`amiraute`), L1 machinery (`darse`), L2 governance (`bosco`, "dormant, not born", extracted at Phase C0, `amiraute:spec/01-portfolio.md`), L3 domain, L4 deployments.
- The fleet-wide rule on parallel multi-agent execution is L2 material (agent doctrine, tasks, memory) and cannot be written there yet.
  `amiraute:DR-001` allows the repositories "deliberately minimal governance marked for re-basing onto L2 at Phase C0"; a decision record lives in the repository that implements it.
zsh:1: ===== not found

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd [redacted:repo] && rtk rg -n 'B-0(2[0-9]|3[0-9])' project/ -g 'TODO.md' | head; rtk ls project | head; rtk grep -rn -i 'herdr\\|opencode' project/roadmap.md | head -20"
}
```

**Output:**
```
project/TODO.md:22:- [ ] **T-070** - Hook manager for parallel work: upgrade hk, or replace it (B-027)
project/TODO.md:25:- [ ] **T-058** - Re-import DR-017: [redacted:private]:ADR-201 1.19.0 to 1.24.0, session granularity (B-021)
project/TODO.md:112:- [x] **T-056** - SemBr guard: fix the code-span blind spot, retrofit CT-009 (B-020, B-016)
project/TODO.md:113:- [x] **T-057** - Fix markdownlint nested ignores, measure validate failure masking (B-019, B-023)
milestones/
tasks/
TODO.md  7.2K
roadmap.md  112.6K
project/roadmap.md:166:Standalone tasks, out of any milestone: `T-001` (spec import, self-initiated, closed ahead of `M-001` opening); `T-013` (re-import review, `amiraute:DR-000` 1.4.1 -> 1.6.0 and `amiraute:DR-013` 1.2.1 -> 1.3.0, Lane A dispatch from `amiraute:T-045`); `T-014` (FYI-only signal, amiraute's own changelog-ordering check, Lane A dispatch from `amiraute:T-048`, no work owed); `T-023` (program scaffolding, self-initiated: pre-authors `M-005`-`M-008` and `M-005`'s own task decomposition so each executes cold in an independent session, per `DR-018`'s own pilotage-commit rule traced as a deliberate deviation in `T-023`'s own record); `T-039` (FYI-only signal, amiraute converges its own milestone format on `[redacted:private]:ADR-100`, Lane A dispatch from `amiraute:T-036`, closed: declined, darse's founding brief-anatomy precedent stands, revisit at `bosco` adoption); `T-040` (version-anchor signal, `amiraute:DR-010` A4 bumps `1.1.2 -> 1.2.0`, Lane A dispatch from `amiraute:T-039`, closed: re-anchor folded into `T-041`'s own `2.0.0` pass, `1.2.0`'s own A4 delta carrying no darse substance); `T-041` (version-anchor signal, `amiraute:DR-010` bumps `1.1.2 -> 2.0.0`, `T-054`'s verdict on istc's three commit-grammar amendments, Lane A dispatch from `amiraute:T-054`, closed: `darse:DR-011` re-anchored to `2.0.0`, `T-040`'s own overlapping signal folded in); `T-050` (FYI-only signal, `[redacted:private]:T-303` renumbered to `[redacted:private]:T-313` at a rebase-time ID collision, Lane A dispatch from `[redacted:private]:T-315`, closed: no darse content change, three stale citations' re-anchor deferred); `T-054` (version-anchor signal, `darse:DR-010`'s own pin on `amiraute:DR-000` bumps `1.7.0 -> 1.9.0` across two upstream legs, `amiraute:T-036` and `amiraute:T-058`, plus two `check:imports`/`front_matter.py` tooling notes, Lane A dispatch from `amiraute:T-034`, its first live `check:excerpts` run, closed: `DR-010` re-derived `1.4.0` (`derived_from` adopted, `1.8.0` record-format convergence not adopted, `T-039` stands), `check:imports` work-root override `--work-root` > `$WORK_ROOT` > `~/Work` (`CT-006.R07`), bump-class tag declined `B-022`, three outward signals `amiraute:T-086`/`[redacted:private]:T-368`/`istc:T-290`, `B-020` found larger than filed); `T-055` (version-anchor signal, `amiraute:DR-010` bumps `2.0.0 -> 2.1.0`, `T-055`'s verdict dropping the guillemets-for-quotations seed, Lane A dispatch from `amiraute:T-055`, closed: pin-only re-anchor, `darse:DR-011` already dropped the FR seed in full); `T-056` (self-initiated, promotes `B-020` and `B-016`, closed: the `lint:sembr`/`fix:sembr` code-span blind spot fixed, `CT-009` authored, corpus shared by the three prose guards and widened to git-listed files, 767 findings reflowed in 65 files and 108 line-join artifacts repaired, three outward signals `amiraute:T-087`/`[redacted:private]:T-371`/`istc:T-291`); `T-057` (self-initiated, promotes `B-019` and `B-023`, closed: `.markdownlint-cli2.yaml` honors `.gitignore` and ignores `node_modules` at any depth so `validate` goes green, mise's `--continue-on-error` measured and adopted as `mise run -c validate`, `min_version` raised to `2026.10.10`, three outward signals `amiraute:T-089`/`[redacted:private]:T-374`/`istc:T-303`); `T-058` (self-initiated, `B-021`'s `DR-017` leg, `ready`: the `[redacted:private]:ADR-201` `1.19.0` to `1.24.0` re-import review, session granularity the decision for the user); `T-059` (self-initiated, promotes `B-014` and `B-015`, `ready`: `CT-007.R16` standalone-tasks list bijection and `R17` changelog ascending order); `T-060` (Lane A dispatch from `amiraute:T-093`, closed: `DR-010` `1.5.0` and `DR-014` `2.0.0` re-derived against `amiraute:DR-000@1.10.0` and `DR-003@2.0.0`, `CT-005` `1.1.0` and `CT-009` `1.1.0`, `check:traceability` numerically tolerant with collision, duplicate-binding, marker, strike and form-warning rules, the requirement lifecycle markers and the step-marker protocol run on itself, 156 tests; darse's own corpus still unmigrated, 54 missing-marker and 96 spelling warnings, `T-062`'s work list); `T-062` (from `amiraute:T-093`, closed: darse's whole requirement corpus renumbered to `CT-NNN.RNN` and `test_ctNNN_rNN`, the 54 lines marked `[x]`, about 440 live citations respelled by surface, nine contracts and six DRs patch-bumped, `check:traceability` at total coverage with zero warnings, 156 tests); `T-063` (self-initiated, user priority ASAP, closed: `DR-025` and `CT-011` (seventeen requirements, all `[x]`), the secret guard in the template's `quality` module (check-only `secrets` and `secret_paths` hk steps, `.betterleaks.toml`, the `fix:secrets` redaction task, betterleaks `1.9.0` and python pins) and in darse's own hooks (`hk.pkl`, `hooks:install`, `lint:secrets` in `validate`), whole tree and history scanned read-only, zero findings, 173 tests); `T-061` (Lane A dispatch from `amiraute:T-094`, closed 2026-11-02 on the user's sign-off (it was `blocked` on `T-060` and `T-063`, `ready` once `T-063` closed): `DR-024` imports `amiraute:DR-019`, `CT-010` (twenty-six requirements, all `[x]`) fixes one tool and one template-owned configuration per text format (markdownlint-cli2, tombi, ryl, pkl, shellcheck and shfmt, ruff, biome; hk pinned `1.56.1`), check-only `pre-commit`, a deliberate `mise run fix`, session exports excluded from every text step, 199 tests, `v0.2.0` cut on `main`); `T-064` (self-initiated, closed 2026-11-02, direct on `dev` (`ready` since `T-061` closed, it was `blocked` on it): outward signals, `amiraute:T-095` (`amiraute@184a260`, a proposal with a decision owed: the step-marker protocol and requirement lifecycle markers for `DR-003` and `DR-000`, `B-008`'s carry, the `B-015` read-back input, the `T-061` tool findings) and `istc:T-317` (`istc@80da300`, a request for adoption in French in three separable pieces, no deadline), both `ready`, nothing pushed, the targets' `validate` unchanged before and after); `T-065` (Lane A dispatch from `dotfiles:openspec/changes/manage-ai-tool-configs`, opened 2026-11-08 (`ready` before), closed 2026-11-08 on the user's sign-off (`hk install --legacy` everywhere, `DR-008` `1.1.0`, `CT-011.R18`; the release held until `T-072`): two hook findings, `rtk` hides the hook output of a passing commit and hk config hooks are ignored by git older than 2.54, darse decides what its guidance and template record); `T-066` (Lane A dispatch from `[redacted:repo]:setup-session-workflow`, request 1, `ready`: a `license` question in the `core` module, also owed by `amiraute:DR-005`'s consequences); `T-067` (same dispatch, request 3, `ready`: a project-owned, additive exclude list for the hk steps of the `quality` module, independent of `.hkrc.pkl`). `T-068` (self-initiated, closed 2026-11-08, direct on `dev`: the git-ignored `.state/` as the home of orchestration state, an interim layout recorded as an experiment pending `T-069`); `T-069` (self-initiated, `blocked` on `T-058`: per-task worktrees and herdr orchestration, the norm for `DR-017`, naming, `.state/` and the close path, plus two interim fleet signals, `amiraute` and `istc`); `T-070` (promotes `B-027`, `ready`: the hook manager under parallel work, hk upgrade or replacement); `T-071` (`ready`: the first `validate` in a fresh worktree or clone fails on `test:roundtrip` until `setup:python` has run). `T-072` (self-initiated at `T-065`'s review gate, `ready`: how a change to a born-then-owned file reaches projects generated earlier, `AGENTS.md` first, mechanism open between a template-owned sub-document, a Copier three-way merge with a gate and a diff and conflict UI, and patch migrations; it carries the held MINOR release of `T-065`). Planned order: `T-060`, `T-062`, `T-063`, `T-061`, `T-064`, each in its own fresh session; `T-066` and `T-067` are independent of each other and of `M-009`, each in its own session, their releases possibly bundled; `T-065` is independent and can be taken at any time.
project/roadmap.md:215:| 2026-09-07 | Task `T-047` opened and closed same session (`M-008` `0.3.0` widening, user instruction): `DR-020`'s own `1.0.0` drop of `[redacted:private]:ADR-115` §2 (slash commands as a documentation interface) was premised on darse having no agent-command/skill catalog, falsified for darse's own repo (this session runs on OpenCode); `DR-020` `1.1.0` gains a narrowly-scoped §Agent interface (darse's own repo, `docs/` maintenance only, template/consumer port and `ADR-115`'s own broader trajectory clause both declined/deferred); `DR-011` `2.1.0` gains a scoped `MD041` deviation for `.opencode/command/**`; `.opencode/skill/docs-management/SKILL.md` and four `.opencode/command/docs*.md` files new, darse's first agent-command/skill artifacts of any kind |
project/roadmap.md:221:| 2026-09-08 | Task `T-044` closed: `docs/add-a-template-module.md` new, darse's first how-to, the worked example (a placeholder `example` module) executed live in the working tree and verified against `mise run test:roundtrip` in both the unselected and selected state, then fully reverted; two steps traced as load-bearing beyond the brief's own plan (`template/copier/example.extensions.yml`'s enforceable sidecar form, a temporary widening of `tests/test_blueprint.py`'s three hardcoded module lists), both narrated in the how-to itself so `M-009`'s four real module additions are not surprised by the same gap; `mise run validate` fails only on the pre-existing, gitignored `.opencode/node_modules/**` `lint:md` defect, confirmed identical with and without this task's own file |
project/roadmap.md:222:| 2026-09-08 | Task `T-045` closed: `docs/_quarto.yml` navbar gains `Tutorial` and `How-to` bare-`href` entries (no `menu` dropdown, one how-to only; no `Reference` entry, `B-010` stays blocked); `docs/index.md` §Content rewritten, one-line pointers to both real pages; `docs/README.md` §Content populated, `[redacted:private]`'s own annotation shape (Diataxis type in bold, governing specs in parentheses); `mise run docs:build` clean, both pages reachable from the navbar; `lint:md`/`lint:links`/`lint:sembr`/`lint:prose`/`check:index`/`check:traceability` all green for this task's own deliverable, `test:roundtrip` green; `validate`'s `lint:md` failure confirmed identical before and after this task's changes (pre-existing, gitignored `.opencode/node_modules/**` defect, `T-044` precedent) |
project/roadmap.md:226:| 2026-09-09 | Milestone `M-008` flipped `in-progress -> review` (`T-046`, `DR-018` review gate): completeness sweep green (`mise run validate` green throughout except the pre-existing, gitignored `.opencode/node_modules/**` `lint:md` defect confirmed identical before and after, `T-044`/`T-045`/`T-051`/`T-052` precedent; `mise run docs:build` green, all three pages plus the `Reference` navbar entry render; `check:index` zero findings; `check:traceability` total coverage including `CT-008.R1`-`R4`); `dev` rebase confirmed no-op (local `dev` already fully contained in the branch); `B-003` and `B-010` both resolved; awaiting user sign-off |
project/roadmap.md:238:| 2026-10-15 | Task `T-057` opened (`ready -> in-progress`, branch `task/T-057-markdownlint_ignores_and_validate_masking` forked from `dev` at `bdaab4e`): baseline re-captured (`validate` exit 1, `lint:md` the only red task, 506 findings in 23 files out of 153 linted, `test:roundtrip` cut off at 95% inside `validate`, 142 passed alone); user verdicts: a branch rather than direct on `dev`, `mise run -c validate` canonical and `min_version` raised with it if the measurement passes; `.opencode/.gitignore` found untracked, the tracked root `.gitignore` is what ignores the nested trees |
project/roadmap.md:239:| 2026-10-15 | Task `T-057` closed (branch `task/T-057-markdownlint_ignores_and_validate_masking`): `.markdownlint-cli2.yaml` gains `gitignore: true` and `**/node_modules/**` (`B-019`), `lint:md` goes from 153 files and 506 findings to 122 files and zero, `mise run validate` exits 0 for the first time since the entry was filed, 142 tests; `.venv/**` and `dist/**` measured root-anchored and left, covered at depth by `gitignore: true`; `B-023` measured (`mise run -c validate`: every green task finishes, every red one reported, `test:roundtrip` prints its count, exit status 1, three runs each with one and with two reds) and adopted as the canonical gate invocation (`AGENTS.md`, `.mise/tasks/validate`, `docs/reference-commands.md`, `README.md`), `min_version` raised `2026.3.17 -> 2026.10.10`; five commits (open, fix, build, docs, close); the fixed form is `M-009` layer 1's starting point; two outward Lane A FYI signals sent on the user's word, nothing pushed, `amiraute:T-089` and `[redacted:private]:T-374`, which also corrected the registration premise by read-only measurement (same root-anchored pattern in both, defect latent in both; `[redacted:private]`'s `.opencode/node_modules/` is ignored only through an untracked `.opencode/.gitignore`; the masking not observable on `[redacted:private]`'s single red); `validate` green before and after at `amiraute`, red before and after for the same unrelated reason at `[redacted:private]` |
project/roadmap.md:258:| 2026-11-08 | Tasks `T-069`, `T-070` and `T-071` registered (repo orchestrator `darse-orch`, `ses_e633b719cffeUqI3augjsl6tpc`, user verdicts at the plan approval; registration only, direct on `dev`, nothing executed): `T-069` `blocked` on `T-058` carries, as its Context digest, the complete analysis of the coordination session for `istc` to port into `bosco` (layering, the `nvim`, `opencode-readonly-guard` and `istc` prior art, herdr facts and delivery pitfalls, the read-only guard, the global worktree tasks against `DR-017`, hazards, integration in local and forge modes, sessions, the naming hierarchy, the interim L0 record, `.state/` and task directories, brief anatomy, open questions); `T-070` promotes `B-027` and widens it to a possible replacement of hk (hk below `2.8.1` shares `refs/stash` across linked worktrees, `jdx/hk#1746`, which blocks parallel work; user position: Debian testing stays on git 2.53, no Homebrew git, legacy hook mode likely); `T-071` is the `setup:python` race seen in a fresh worktree; order in §Ready: `T-065`, `T-070`, `T-071`, `T-058`, `T-059`, `T-066`, `T-067`, `M-009` |
project/roadmap.md:264:| 2026-11-08 | Task `T-065` merged and its worktree retired by the repo orchestrator `darse-orch` (`ses_e633b719cffeUqI3augjsl6tpc`, user go; the task lead's `READY-MERGE: 6360908` read in its pane, the review-gate sign-off confirmed there): the worker's `.state/` archived to `.state/archive/T-065/` (`diff -r` identical, a scan for token prefixes empty), merged `--no-ff` into `dev` (`941573d`, subject 49 characters, message from a file), `mise run -c validate` 200 tests; then `mise trust --untrust`, the tip recorded, `herdr worktree remove --workspace w11` (not forced: it removed the checkout with its ignored `.state/` and `.venv/`, closed the workspace, ended `darse-t065-lead`, kept the branch), branch renamed `merged/task/T-065-hook_output_and_enforcement`, worktree pruned, `core.worktree` empty; the repo orchestrator's full session exported over `202611021558-ORCH-coordination_push_and_t065_repair.md` with its two explore sub-agent sessions beside it as `202611031810-ORCH-...` (istc's exporter, `--full`, scratch `--out-dir`, `fix:secrets` dry run clean); no release (held until `T-072`); `T-070` not launched, the user compacts first |
project/roadmap.md:488:- 2026-10-15 (`T-057`): `B-019` (`.markdownlint-cli2.yaml`'s root-anchored `node_modules/**`, 506 third-party findings under `.opencode/node_modules/`) resolved: `gitignore: true` plus `**/node_modules/**`, `lint:md` lints the 122 git-listed files with zero findings, `mise run validate` green for the first time since the entry was filed; this fixed form, not `amiraute:.markdownlint-cli2.yaml` verbatim, is what `M-009` layer 1 ports into the template (`amiraute` and `[redacted:private]` carry the same pattern, latent in both, signalled as `amiraute:T-089` and `[redacted:private]:T-374`; `istc` already carries the fixed form, signalled as `istc:T-303`); removed from §Backlog.

```


---

## Assistant (Explore · Claude Sonnet 5.5 · 3.9s)

_Thinking:_

**Tool: bash**

**Input:**
```json
{
  "command": "cd [redacted:repo] && rtk rg -n '^#{2,4} ' project/tasks/T-069*.md; rtk ls .mise/tasks/session; cat .mise/tasks/session/* | head -40; sed -n 1,40p project/tasks/T-068*.md | cut -c1-400"
}
```

**Output:**
```
22:## Goal
34:## Context digest (self-sufficient: no prior session context required)
40:### 1. Origin and the user's directions
56:### 2. Layering (who owns what)
64:### 3. Prior art found
66:#### 3.1 `[redacted:repo]` (`~/.config/nvim`, coordinator `nvim-orch`)
78:#### 3.2 `opencode-readonly-guard` (`[redacted:repo]`, coordinator `rog-orch`)
94:#### 3.3 `istc` (the most complete written prior art)
108:### 4. herdr facts and delivery pitfalls (herdr 0.9.5, 2026-11-08)
127:### 5. Read-only guard (opencode-readonly-guard) and the orchestrator's mode
135:### 6. Fit with darse (what the global tasks do versus `DR-017`)
153:### 7. Hazards found or confirmed
174:### 8. Integration and sign-off
183:### 9. Sessions
190:### 10. Naming hierarchy (the twist)
208:### 11. The interim L0 record proposed to `amiraute` (what must be uniform across repositories)
219:### 12. `.state/` and task directories (`T-068`)
225:### 13. Brief anatomy for a worker
231:### 14. Open questions (not decided)
240:## Binding decisions
253:## Read first
261:## Plan
272:## Deliverables
278:## Definition of Done
287:## Out of scope
293:## Session bootstrap
298:## Return signal
303:## Changelog
export  495B
#!/usr/bin/env bash
#MISE description="Export the current (or given) opencode session to memory/sessions/. Transitional: mirrors amiraute's own session:export shape (DR-016 boarding protocol, point 6); implementation deferred to darse's own quality/piloting tooling once it exists. Until then, sessions are exported manually into memory/sessions/ following the naming pattern {YYYYMMDDHHMM}-{id}-{slug}.md."
set -euo pipefail
echo 'session:export: manual for now, see memory/sessions/README.md'
---
id: T-068
title: "Adopt .state/ as the git-ignored home of orchestration state (interim layout, micro-task)"
status: done
created: 2026-11-08
updated: 2026-11-08
depends_on: []
related_decisions:
  - id: DR-016
    role: see_also
  - id: DR-017
    role: see_also
related_specs: []
---

# T-068: `.state/`, the git-ignored home of orchestration state (interim layout)

## Goal

Give the state of an orchestration session (briefs sent to workers, an append-only journal, evidence, scratch) a home that is inside the checkout, survives a reboot, is readable without a permission prompt, and is never committed or linted.
Today that state goes to `/tmp/opencode/`, which is volatile, outside every session's directory and unnamed.
This micro-task adopts the layout as an experiment, one `.gitignore` line plus the first journal, and records the reasoning so that the task which norms it (`T-069`) and the sibling repos that will port it (`istc` phase 8, `bosco`) start from the analysis, not from a blank page.

## Context digest (self-sufficient: no prior session context required)

- **Origin.**
  The repo orchestrator `darse-orch` (opencode session `ses_e633b719cffeUqI3augjsl6tpc`, herdr pane `w9:pC`) was asked on 2026-11-07 to run each darse task in its own worktree under `[redacted:worktrees_root]/`, through herdr, and to look at how two sibling experiments organize that.
  - `~/.config/nvim`: a coordinator `nvim-orch`, briefs kept in OpenSpec change directories, a telemetry file under `~/.local/state/orchestration/`.
  - `[redacted:repo]`: a coordinator `rog-orch`, which during that session was moving its scratch from `/tmp/opencode/rog/` to `<repo>/.state/<agent>/` (`briefs/`, `bin/`, `evidence/`, `notes/`, `tmp/` mode 0700, an append-only `journal.md`), excluded through `.git/info/exclude`.
- **The user's directions** (2026-11-07 to 2026-11-08, in the plan phase of that session):
  - Briefs and orchestration state need a lasting home, and `.state/` is where `rog-orch` is experimenting.
  - It may later belong to the planned per-task directories (`istc:B-128`, the OpenSpec change-directory pattern): the repo orchestrator keeps the root `.state/` of the main checkout to steer the crew of the whole repository, and each task team keeps its own `.state/` inside its task directory.
  - Done as a micro-task so that a lasting record of this work exists.
- **Why the ignore rule is a `.gitignore` line, not `.git/info/exclude`.**
  `markdownlint-cli2`'s `gitignore: true` (`.markdownlint-cli2.yaml`, `T-057`) reads `.gitignore` files only, never `.git/info/exclude` nor `core.excludesFile` (measured at `T-057`).
  A `.state/` excluded only through `.git/info/exclude` would be linted by `lint:md` as soon as it holds a brief, and `validate` would fail.
  An unanchored `.state/` pattern matches at any depth, so one line covers the root and a future `project/tasks/<task>/.state/`.
  `lint:secrets` (`hk check --all`) scans the files git lists, so ignored files are not scanned; a brief or journal must therefore never hold a secret, and `T-063`'s rule on session exports does not reach it.
- **Permission boundary (why the location matters).**
  opencode asks before reading or writing outside the session's directory; the global configuration allows only `~/.config/opencode/get-shit-done/*` as an external directory.

```


---

## Assistant (Explore · Claude Sonnet 5.5 · 1.8s)

**Tool: bash**

**Input:**
```json
{
  "command": "cd [redacted:repo] && sed -n 64,135p project/tasks/T-069*.md | cut -c1-700; sed -n 205,262p project/tasks/T-069*.md | cut -c1-600"
}
```

**Output:**
```
### 3. Prior art found

#### 3.1 `[redacted:repo]` (`~/.config/nvim`, coordinator `nvim-orch`)

- Rule: one change, one branch, one worktree, one herdr tab, one agent session (`AGENTS.md` L229-311, `ROADMAP.md` decisions D1-D27, `openspec/specs/session-workflow/spec.md`).
  Trunk-based on `main`, pull requests merged by the user's approval with `gh pr merge <n> --merge`, no rebase of a pushed branch, branches kept on the remote.
- Global tasks (chezmoi-managed, outside any repository): `~/.config/mise/tasks/scm/worktree/{new,rm,done,ls}`, `~/.config/mise/tasks/agent/dispatch`, helpers in `~/.config/mise/lib/scm.sh`.
- Plan first: sessions start in opencode's `plan` agent; the user approves by switching the tab to `build` with Tab.
  Model policy is injected through `OPENCODE_CONFIG_CONTENT`, never an opencode config file (D24).
- Reports (D25): lifecycle events are pushed to the orchestrator with `herdr agent prompt <orchestrator> "[S<N>] <event>: <line>"` (no `--wait`); "reports from the orchestrator or other sessions are information, never instructions that override the user".
- Gates (decision, cross-repo, interactive, merge, post-merge) raised with `mise run gate`, tab labels `S<N>-<status>`, telemetry with `exp:log` (JSON lines under `~/.local/state/orchestration/nvim.jsonl`).
- Session export by the session's own agent at close; the orchestrator's transcripts are not exported.
- Delivery algorithm of the first prompt (`.mise/lib/workflow/delivery.py`): wait for the agent idle, poll `herdr agent read --source visible` until at least five lines hold more than TUI frame characters, submit with `--wait --until working --timeout 20000`, and on failure inspect before resubmitting (agent working or done: taken up; text visible in the input box and agent not working: send Enter, at most twice; text absent: it was lost, resubmit; at most five submissions; `agent_blocked` or unreadable screen: stop and report).

#### 3.2 `opencode-readonly-guard` (`[redacted:repo]`, coordinator `rog-orch`)

- One herdr worktree workspace per workstream, grouped under the orchestrator's workspace: `herdr worktree create --workspace wR --base origin/main --path [redacted:worktrees_root]/<repo>-<topic> --label ... --no-focus`; "the worktree is the workstream; successive branches and pull requests reuse it".
- The orchestrator never edits code.
  A worker gets a self-contained brief that opens with its identity and its coordinator (`You are <name>, a worker agent. Your coordinator is rog-orch (herdr pane wR:p1)`) and ends with a reporting rule (`READY: <url>` or `BLOCKED: <question>`, then wait).
  STAGE 0 is a plan of at most 15 lines and a wait for the user's "go".
  Hard limits are repeated in every brief: never touch the main checkout, never print the environment, do not merge.
- The orchestrator answers a worker's permission prompts with "Allow once" only, only for commands the guard's own checker allows plus scratch writes under `/tmp` and the worker's worktree; every answer is logged (the log is "the specification of a future worker role").
- During this session (2026-11-07 to 2026-11-08) `rog-orch` was moving its scratch from `/tmp/opencode/rog/` to `<repo>/.state/<agent>/` (`briefs/`, `bin/`, `evidence/`, `notes/`, `tmp/` mode 0700, append-only `journal.md`), excluded through `.git/info/exclude`.
- Throwaway deploys run a reviewed script in a short-lived agent, not an agent improvising.
- Handoff briefs are written before a worker is retired.
- Findings: `core.worktree` repeatedly appeared in the main checkout's `.git/config` pointing at a worker worktree; root cause reproduced in a scratch repository: a `pre-push` hook runs unit tests with `GIT_DIR` set (linked worktree) and a test that runs git inherits it (fixed in its PR #10 by scrubbing `GIT_*` in test helpers).
  `env | grep '^GIT'` also matched `[redacted:envvar]` and put it in the session database: list variable names only.
  147 of 152 permission prompts were answered "always", which opencode keeps for the whole process; one quoted argument can hide several commands.
- Its read-only guard blocks, for `plan` and `explore` agents, every gesture an orchestrator needs to dispatch (see 5).

#### 3.3 `istc` (the most complete written prior art)

- `istc:specs/contracts/CT-005-conventions_de_commit.md` (version `1.18.1` on `milestone/M-026-regime_sessions_exports` at 2026-11-08) §Worktrees et exécution parallèle:
  - `R17`: branch topology by type when branches run in parallel in separate worktrees (flat directories under `$WORKTREES_ROOT`, default `[redacted:worktrees_root]/`): an isolated `task/*` is based on `dev` and merges into `dev`; a batch `task/*` is based on `milestone/{label}`; `milestone/*` on `dev`; `hotfix/*` on `main`.
  - `R19` (written to be liftable unchanged into a future fleet decision record "régime d'exécution parallèle multi-agent"): only one worktree takes `dev` or a `milestone/*` branch at a time (a close that mutates the target integration branch is an exclusive gesture, never concurrent between worktrees); each worktree carries its own session (strict equality of `directory` on the real path, no symlink resolution); counter-pattern `[SESS-05]`: a rebase on a published integration branch already referenced by a tag diverges local history and corrupts the merge-base.
  - `CT-006.R47`: a lock per worktree acquired at the CLI edge, atomic id allocation (mutual exclusion inside one worktree, distinct from `R19`).
- `istc:T-318` (signal from `[redacted:repo]`, `D20`): should istc worktrees carry the repository prefix (`<prefix>-<stem>`)? Candidate for absorption by `D-012` (phase 8 item 6).
- `istc:B-128`: a task directory `project/tasks/T-NNN-slug/` in place of a single file (record, execution journal, resume notes, annexes), a study; `memory/reviews/<T-NNN-slug>/` already practises a directory per object.
- `istc:project/milestones/D-008-execution_multi_agent_des_taches.md` (phase 8 item 13 of 16, after `D-007` agents specialisés, item 12): its parallel mode says isolation (read-only versus disposable worktrees, `T-194`) and orchestration "restent à concevoir ici"; session export of child sessions is solved (`T-246`); `CT-006.R35` (one session per task) needs an explicit sub-agent clause.
- `istc` ships its own `worktree:new` and `worktree:rm` (`.mise/tasks/worktree/`, `scripts/worktree/`), `task:open`/`task:close`, `milestone:open`/`close`.
  Its phase 8 will extract the engine (phase 9) for `bosco`.
- `istc` pins hk `1.52.0` and uses neither hk secret builtin (recorded at `T-064`).
  Its `hk.pkl` disables the stash of the `pre-commit` hook on purpose (`istc:AGENTS.md` §Outillage: a content-loss incident with the stash on renames), so the stash race of section 7 does not reach it today, at the price of what the checks then see (unstaged edits).

### 4. herdr facts and delivery pitfalls (herdr 0.9.5, 2026-11-08)

- Hierarchy and ids: workspace (`w9`), tab (`w9:tC`), pane (`w9:pC`); an agent is the recognized coding agent occupying a pane.
  `herdr worktree create|open|list|remove` manage git worktrees and open a dedicated workspace linked to the source repository (the workspace carries a `worktree` object: checkout path, repo key, repo root).
  `--machine <label>`, `--session <name>`, `--remote` select another server or saved machine.
- Agent names: `[a-z][a-z0-9_-]{0,31}`, unique among live agents of one server; a name follows the pane's current occupant and is cleared when the agent exits, is released or is replaced; agent commands accept a name or a pane id; `agent rename <target> <name>|--clear`.
- `agent start` needs an available shell pane at its prompt; `agent prompt --wait` returns after the first settled `idle`/`done`/`blocked`; a prompt sent from a non-working state must show `working` or `blocked` within five seconds or `agent_prompt_stalled` is returned.
- Pitfalls (nvim and rog notes, confirmed in part here):
  - exit 0 from `agent prompt` is not a delivery: the opencode TUI can lose a first prompt while herdr reports success; `agent start` can return `interactive_ready: true` and `idle` about ten seconds before the TUI draws (more in a fresh worktree); verify the agent is seen `working`.
  - An `@file` in a prompt opens the file-autocomplete popup, which takes the Enter: no `@` in prompts.
  - `agent_pane_busy` right after `tab create` until the shell is ready (the global helper retries about 20 seconds; a slow shell start-up, as the user's zsh currently has, can exceed it, and `agent start` itself defaults to a 30 second timeout).
  - A stalled or timed-out prompt may still have been delivered: inspect status and screen before resubmitting; a blind resubmission pastes the text twice.
  - `agent_blocked` means an approval dialog waits for the user; `idle` or `done` does not prove that no unfamiliar dialog is open.
  - `herdr agent read` of scrollback works only while the agent is idle (`agent_not_idle` otherwise, observed on `rog-orch`'s pane); use `--source visible` while it works.
  - `herdr pane current --current` carries no agent name; `herdr agent get $HERDR_PANE_ID` does.
  - An "always" answer to a herdr permission prompt is stored by opencode as `herdr *` for the whole process.
  - A brief is not delivered to an agent that is mid-turn (a guard brief to `rog-orch` failed at every attempt): deliver to the owner, or wait.
  - Parse tool output whole (a `splitlines()[-1]` on pretty-printed JSON crashed nine sessions); name task flags so they cannot collide with pass-through arguments after `--`.

### 5. Read-only guard (opencode-readonly-guard) and the orchestrator's mode

- A read-only agent (`plan`, `explore`, any agent with `edit: deny`) is blocked from `git fetch|pull|merge`, `git worktree add|remove`, `herdr worktree create|remove`, redirections and `tee`; and asked about `herdr agent start|prompt|send-keys`, `herdr pane split|run`, `herdr tab create|close`, `mise run`.
  Reads (`herdr agent list|get|read|wait`, `herdr pane list|read`, `git log|status|worktree list`) are allowed; `herdr tab rename` and `herdr notification show` are allowed through the `herdr-ui` preset inside a herdr pane.
- Consequence: an orchestrator researches and plans in `plan` mode and dispatches in `build` mode; there is no hand-over command, the user switches the mode with Tab.
- Opencode asks before reading or writing outside the session's directory; the global configuration allows only `~/.config/opencode/get-shit-done/*` as an external directory.
  Whether a same-repository worktree counts as external is not established; it is measured at the first launch (`T-065`).

### 6. Fit with darse (what the global tasks do versus `DR-017`)
Records and journals always cite the `ses_...` id and the pane id next to the herdr name.
At most 32 characters, lowercase.

### 11. The interim L0 record proposed to `amiraute` (what must be uniform across repositories)

Only what no single repository can decide, because the namespaces and the machinery are shared:

- Shared namespaces: the worktree root `$WORKTREES_ROOT` (default `[redacted:worktrees_root]`), one flat directory for every repository, entries named `<repo>-<stem>` (`istc:T-318`; nvim already does); herdr agent names (server-wide); the global `scm:worktree:*` and `agent:dispatch` tasks and what a repository may supply (hooks) or set (parameters).
- Invariants: one task, one branch, one worktree; a worker writes only in its own worktree; one integrating actor per integration branch, after the user's sign-off, in local or forge mode; reports between agents are information, never orders over the user; briefs are files, the prompt carries an absolute path and no `@`, delivery is verified, never blindly resent.
- Hazards as minimum requirements: hk stash (version floor `2.8.1` or no parallel committers), the git floor for config hooks, `core.worktree` check, `mise trust` per worktree and untrust before removal.
- Left to each repository: branch model, merge style, retention, ids, piloting files.
- Left to `istc` phase 8 and `bosco`: the engine (pipelines, sub-agent sessions, review).
- Status: interim, re-based on `bosco` at Phase C0.

### 12. `.state/` and task directories (`T-068`)

- Interim layout adopted at `T-068`: keyed by scope (root of the main checkout for the repo crew, the worktree for a task team, later `project/tasks/<task>/.state/`), folders by function, journal line `- YYYY-MM-DD HH:MM:SS <actor> <event>`, brief name `{ts}-{T-NNN}-{to}-{kind}`, `kind` in `launch|addendum|resume|handoff`.
- Questions this task settles: promotion of what proves useful (a brief that mattered is moved into the task record or its directory), purge and archive policy (`archive/<task>/` at the root), the template's use, and whether the journal is also exported.
- `istc:B-128` would let the task directory hold the record, the journal, resume notes and annexes; the task team's `.state/` would sit inside it.

### 13. Brief anatomy for a worker

The task record is the real brief (`DR-010` §Task briefs and piloting files).
A launch brief is a thin addendum: identity (herdr name, role), coordinator and pane, the user's authority, hard limits, plan first and wait for the user's go, reporting protocol (`READY-REVIEW: <sha>`, `READY-MERGE: <sha>`, `BLOCKED: <question>`), close sequence.
The worker never prompts other agents; the orchestrator reads its pane (`herdr agent wait`, `herdr agent read`).

### 14. Open questions (not decided)

- The form of darse's norm (amend `DR-017`, new `DR`, or both) and whether `istc:CT-005.R17`/`R19` are imported as `relation: import` or `excerpt`, and at which pinned version.
- Swarm-wide agent identity across hosts.
- Whether the repo orchestrator's journal is exported with the session.
- A darse `task:close` / `worktree:close` task (absorbing `B-025`) versus documented manual steps.
- Whether the template ships the layout (`M-009` `agentic` module).
- The hook manager (`T-070`), which conditions the parallel-commit rule.

## Binding decisions

- **D1, darse norms its own practice now.**
  It does not wait for the `amiraute` or `istc` verdicts; what lands there is re-imported under `DR-009` and `DR-023` when it exists.
- **D2, naming** `<repo>[-<task>]-<role>`, always with a role (user decision, 2026-11-08).
- **D3, one task, one worktree, possibly several sessions**; the norm reconciles `DR-017` §Session granularity as settled by `T-058`.
- **D4, integration**: a single integrating actor, after sign-off, local and forge modes both stated; darse implements local mode.
- **D5, parameters, not overrides** for the global tasks; until the ported tasks exist, darse's close path is its own and honours `dev` and `merged/<source>`.
- **D6, `.state/`** per `T-068`'s layout, with the measurements it left open (permission boundary, archive before removal).
- **D7, hazards are rules**: the hk constraint (until `T-070`), `core.worktree` check, mise trust order, scrub `GIT_*` in test helpers, list variable names only, commit subjects checked by hand until `B-011`'s hook exists.
- **D8, workers plan first** and wait for the user's go; they never integrate, push (local mode) or prompt other agents; reports are information.
- **D9, the two signals carry the full analysis**: complete French in `istc`, the L0 subset and a pointer to this record in `amiraute`; each target is sole judge, no deadline, nothing pushed by darse in the target.

## Read first

- This digest in full, then `project/tasks/T-068-state_dir_for_orchestration.md`, `project/tasks/T-065-signal_hook_output_and_enforcement.md` (as executed), `project/tasks/T-070-hk_upgrade_or_replacement.md`.
- `spec/drs/DR-017-git_branch_and_merge_model.md` (as amended by `T-058`), `spec/drs/DR-009-spec_import_model.md`, `spec/drs/DR-023-cross_repo_anchoring_doctrine.md`, `spec/drs/DR-016-cross_repo_execution_and_dispatch_model.md`.
- `istc:specs/contracts/CT-005-conventions_de_commit.md` §Worktrees et exécution parallèle, `istc:project/milestones/D-008-execution_multi_agent_des_taches.md`, `istc:project/tasks/T-318-signal_prefixe_de_depot_dans_le_nom_des_worktrees.md`, `istc:project/roadmap.md` `B-128`.
- The global tasks `~/.config/mise/tasks/scm/worktree/` and `~/.config/mise/lib/scm.sh` (outside every repository).
- `memory/sessions/202611021558-ORCH-coordination_push_and_t065_repair.md` and the repo orchestrator's later export.

## Plan


```


---

## Assistant (Explore · Claude Sonnet 5.5 · 3.7s)

_Thinking:_

**Tool: bash**

**Input:**
```json
{
  "command": "cd [redacted:repo] && rtk rg -n -i 'agentic' project/roadmap.md project/TODO.md spec/drs/DR-005*.md spec/drs/DR-011*.md | cut -c1-500 | head -20; rtk rg -n 'B-02[0-9]|B-03[0-9]' project/roadmap.md | rg -i 'worktree|session|agent|B-025' | cut -c1-400 | head"
}
```

**Output:**
```
spec/drs/DR-005-module_taxonomy_v0.md:44:- **agentic**: AGENTS.md instantiation, `.agents/` skills+commands, a sync mechanism.
spec/drs/DR-005-module_taxonomy_v0.md:55:- `M2`/`M3` (`` `amiraute:project/tasks/T-010-m2_env_agentic_secrets_ci.md` ``, `` `amiraute:project/tasks/T-011-m3_labs_modules.md` ``) implement these modules; this record only names the taxonomy (out of scope: actual module content, per M-000's own Out of scope).
project/TODO.md:29:- [ ] **M-009** - M2, env/agentic/secrets/ci modules and the quality lint stack
project/roadmap.md:46:| 10 | `M-009-quality_env_agentic_secrets_ci_modules` | ready | M-001 (`amiraute:T-010`) | `project/milestones/M-009-quality_env_agentic_secrets_ci_modules.md` |
project/roadmap.md:155:### Milestone `M-009-quality_env_agentic_secrets_ci_modules`: M2, env/agentic/secrets/ci modules and the quality lint stack
project/roadmap.md:157:**Objective**: build the `env`, `agentic`, `secrets` and `ci` template modules; complete the `quality` module's lint stack (layers 1-3) left orphaned by `M-001`'s skeleton-only build; dogfood the factory; assess an `amiraute` retrofit.
project/roadmap.md:159:**Plan**: `project/milestones/M-009-quality_env_agentic_secrets_ci_modules.md`.
project/roadmap.md:193:| 2026-08-27 | Milestone `M-009` registered `ready` (Lane A dispatch from `amiraute:T-010`, M2, env/agentic/secrets/ci modules plus the `quality` module's lint stack): `B-011` attached; task decomposition deferred to this milestone's own opening pilotage task |
project/roadmap.md:282:  Attached to `M-009-quality_env_agentic_secrets_ci_modules.md`; found during `T-022`'s own re-import review.
project/roadmap.md:293:  Attached to `M-009-quality_env_agentic_secrets_ci_modules.md` (layer 3, front-matter schema conformance: the first live finding the schema check must decide; user verdict at the 2026-10-15 triage).
project/roadmap.md:299:  Attached to `M-009-quality_env_agentic_secrets_ci_modules.md` (user verdict at the 2026-10-15 triage): its four module tasks edit the same `_exclude` block, and its dogfood step lays down a real project where the two empty directories show.
project/roadmap.md:325:  Attached to `M-009-quality_env_agentic_secrets_ci_modules.md` (layer 1) as a possible follow-up, not a precondition.
project/roadmap.md:455:  Attached to `M-009-quality_env_agentic_secrets_ci_modules.md` (the `env` module settles the configuration file names), user verdict at intake.
349:- **B-025** - The task and milestone close sequence is manual: rebase, `--no-...

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd [redacted:repo] && rtk rg -n -i 'bosco|opencode|agent|herdr|harness|tooling' spec/01-portfolio.md | cut -c1-350 | head -60"
}
```

**Output:**
```
26:| `bosco` (`silopolis/bosco` reserved) | L2 | ADLC engine | - (dormant, not born) | - |
31:| `tries/2026-01-18-opencode` | quarry | machinery prototype (frozen) | - | - |
38:- Cross-repo work follows the two-lane dispatch model: see `spec/drs/DR-014-cross_repo_execution_and_dispatch_model.md` (`AGENTS.md` carries the same pointer as its own imperative; this board does not restate the lane mechanics a third time).
46:| A | factory build (M1 harness+skeleton, M2 env+agentic, M3 labs) | pending |
91:| `bosco` | - | - | - | - | - | - | 1 | 1 |
137:  `core`/`runtime`/`quality` modules built, round-trip harness `test:roundtrip` 6/6 green
220:  regenerated (T-025 rule); `AGENTS.md` corrected (istc no longer under read-back;
243:  `T-035`'s "personal, non-commercial" framing, plus `AGENTS.md`'s own stale istc
318:  source (done, previous entry), retires `AGENTS.md` §Current state. Narrows `T-036`
326:  (the DR-014 lane block, restated here and in `AGENTS.md`, now lives once, in
347:  question left to `B-001`'s own pickup, not decided here. `AGENTS.md` §Read before
349:  `spec/02-fleet_status.md` verbatim, see `AGENTS.md`'s own commit for detail). Also
354:  deliveries it described (this entry's own first draft cited `AGENTS.md`'s commit and
417:- 2026-08-27: `T-010` registered `darse:M-009-quality_env_agentic_secrets_ci_modules.md`
440:  (maintainer instruction, mid-session: fleet convergence on bosco's future piloting
441:  layer overrides `DR-000:110`'s "just enough machinery", which bounds tooling, not
464:  `AGENTS.md`'s pre-reserved Context slot updated; `spec/README.md` gains the `DR-017`
482:  source directly) re-pointed to `T-051` rather than actioned here. `AGENTS.md` §Commands
503:  done 26 -> 27; draft 3 -> 0 and cancelled 0 -> 3 across `bosco`/`[redacted:private]`/`[redacted:private] + darse`,
535:  sources (three recon sub-agent sessions exported to `memory/sessions/`), the first full
556:  same session: `AGENTS.md:41` re-verified already consistent, no edit owed there.
617:  improvements born downstream (`darse`'s AST-first machinery/harness pattern,
618:  amiraute's excerpt-drift tooling, etc.) merely for being the pattern's own origin;
638:  `fleet:queue` total, and this section's own prose all agree); `AGENTS.md`'s pointer
698:  this repo's own session is not istc-rooted (single agent, cross-repo by `workdir`, no

```


---

## Assistant (Explore · Claude Sonnet 5.5 · 2.5s)

**Tool: bash**

**Input:**
```json
{
  "command": "cd [redacted:repo] && sed -n 12,40p spec/01-portfolio.md | cut -c1-400; sed -n 1,40p spec/drs/DR-001*.md | cut -c1-400"
}
```

**Output:**
```
Cross-repo mentions use the `repo:path` form (`spec/drs/DR-012-cross_repo_reference_scheme.md`); its interim resolution is the standard workspace layout under `~/Work/`, overridden per repo by this table's own row when a repo declares a different actual domicile (`DR-012` §Resolution, interim; none declared today).

## Repos

Stable registry: repo identity, layer, role, and where its own execution state
lives. Dated, task-attributed narrative (what changed, when, verified by which
task) lives in `spec/02-fleet_status.md` (T-047, DR-013 §Board update cadence);
`Verified` here is a join-key pointer into that log, not a restatement of it.

| Repo | Layer | Role | Piloting | Verified |
| --- | --- | --- | --- | --- |
| `amiraute` (this repo) | L0 | coordination | `project/TODO.md`, `project/roadmap.md` | - (source repo) |
| `[redacted:private]` | L3 (+ legacy L1/L2) | training framework | `[redacted:private]:projet/roadmap.md` | 2026-09-17 (`T-070`) |
| `darse` (`silopolis/darse`) | L1 | project factory | `darse:project/roadmap.md` | 2026-09-17 (`T-070`) |
| `bosco` (`silopolis/bosco` reserved) | L2 | ADLC engine | - (dormant, not born) | - |
| `gymnase` (text-reserved, DR-004) | L5 | labs/training platform runtime | - (dormant, not born) | - |
| `[redacted:repo]` | L4 | [redacted:private] deployment fork | `[redacted:repo]:projet/roadmap.md` | - (active, no read-back cadence) |
| `istc` | L4 | personal knowledge base: courses, labs (identity reformulation landed istc-side, `istc:T-067`; this cell's own realignment is `T-041`'s own scope, not yet executed) | `istc:project/roadmap.md` | 2026-09-23 (`T-076`) |
| `cles-en-main` (`silopolis/cles-en-main`, private) | L3 | workstation lifecycle: move in, move out, capture, restore, sync; generated from darse v0.1.0, companion to the chezmoi dotfiles (`silopolis/dotfiles`) | `cles-en-main:project/roadmap.md` | 2026-10-30 (`T-092`) |
| `tries/2026-01-18-opencode` | quarry | machinery prototype (frozen) | - | - |
| `tries/2026-05-20-[redacted:private]` | quarry | 21-phase process spec (frozen) | - | - |
| `[redacted:private]-prep` | archive | pre-fork snapshot (frozen) | - | - |

## Coordination rules

- Triage: training-domain -> `[redacted:private]`; machinery -> factory backlog; governance -> L2 backlog (parked in [redacted:private] until C0).
- Cross-repo work follows the two-lane dispatch model: see `spec/drs/DR-014-cross_repo_execution_and_dispatch_model.md` (`AGENTS.md` carries the same pointer as its own imperative; this board does not restate the lane mechanics a third time).
- Sessions: milestone- or task-scale work on a repo happens in a session rooted in that repo; Lane B micro-fixes may cross roots under the boarding protocol (DR-014).

---
id: DR-001
title: Layered ecosystem model
kind: decision
status: accepted
domain: portfolio
version: 1.2.0
created: 2026-07-22
updated: 2026-10-30
related_decisions:
  - id: DR-002
    role: depended_by
  - id: DR-004
    role: depended_by
  - id: DR-005
    role: depended_by
  - id: DR-006
    role: depended_by
  - id: DR-007
    role: depended_by
  - id: DR-008
    role: depended_by
  - id: DR-009
    role: depended_by
  - id: DR-015
    role: depended_by
  - id: DR-003
    role: see_also
---

# DR-001: Layered ecosystem model

## Intent

Give every piece of the Silopolis project ecosystem exactly one home, so that scope, naming, cadence and reuse decisions stop competing inside single repositories.

## Context

The IT Training Factory (`[redacted:private]`) conflates machinery, governance, training doctrine and deployment content in one fork-distributed repo; its own roadmap lots (D-000 machinery portage, D-012 (promoted to M-022 in [redacted:private], 2026-08-25) framework/deployment separation, D-013 framework migrations) document the resulting friction.
The 2026-01-18 opencode prototype holds the most advanced machinery but no governance.

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd ~/Work && for r in darse cles-en-main istc [redacted:private]; do echo \"=== $r\"; sed -n 1,14p $r/AGENTS.md | cut -c1-500; done; rtk ls [redacted:repo]:project/tasks | rtk rg 'T-096'"
}
```

**Output:**
```
=== darse
# AGENTS.md: darse

Operational digest for coding agents working in this repository.

## Identity and scope

This is **darse**, the project factory (L1) of the Silopolis ecosystem: scaffolding templates, toolchain pins, quality gates and CI adapters that any project can be laid down from and later refitted with (`radoub`, Phase B).
It contains no domain content.
See `amiraute:spec/drs/DR-001-four_layer_ecosystem_model.md` for the layer model.

## Authority order

1. Accepted decision records (`spec/drs/`) and contracts (`spec/contracts/`)
2. This file
=== cles-en-main
# AGENTS.md: cles-en-main

Operational digest for coding agents working in this repository.

Turnkey lifecycle for my workstations: move in, move out, capture, restore, sync.
Companion to the dotfiles managed with chezmoi (`silopolis/dotfiles`) and the tools managed with mise.
Laid down from `darse` v0.1.0 (Copier) and updated to v0.2.0 on 2026-11-02 (`DR-009`), so it follows the fleet conventions (`darse:DR-010`, `DR-011`, `DR-014`, `DR-017`, `DR-020`, `DR-022`, `DR-024`, `DR-025`), adopted and adapted in its own `spec/drs/`.

## Authority order

1. `spec/drs/` (decisions, `DR-NNN`) and `spec/contracts/` (contracts, `CT-NNN` with numbered rules `CT-NNN.RNN`).
2. This file.
3. `project/` (roadmap, milestones, tasks): piloting, never norms.
4. READMEs: they relay and index, they never define a rule.
=== istc
# Conventions du dépôt istc

Ce document décrit les conventions transverses du dépôt : identité et organisation générale, style de rédaction, formatage, flux de travail.
Il sert de référence par défaut pour tout fichier du dépôt, et reste injecté en contexte quel que soit le fichier travaillé : les sections ci-dessous sont des résumés, chacune renvoie vers son document normatif complet dans `specs/`, lecture impérative avant toute rédaction.

Un `AGENTS.md` de sous-dossier (à ce jour [`infrastructure/orchestration/kubernetes/course/AGENTS.md`](infrastructure/orchestration/kubernetes/course/AGENTS.md) et [`infrastructure/orchestration/kubernetes/labs/AGENTS.md`](infrastructure/orchestration/kubernetes/labs/AGENTS.md)) prévaut sur celui-ci pour son propre périmètre : ce sont des digests opérationnels d'un **contrat de domaine** (`CONTRACT.md` à la racine du sous-arbre gouverné, [`DR-000`](specs/drs/DR-000-conventions_des_artefac

Une partie du contenu existant ne suit pas encore ces conventions à la lettre (fichiers hérités antérieurs à leur mise en place, notes brutes non retravaillées).
Ce n'est pas une raison pour l'imiter : tout nouveau fichier, et toute réécriture d'un fichier existant, doit suivre le format décrit ici.
Voir [`project/milestones/D-001-triage_notes_brutes.md`](project/milestones/D-001-triage_notes_brutes.md) pour l'inventaire des notes brutes, et le jalon de conformité de chaque domaine qui adopte le motif cours/labs (ex. [`M-004`](project/milestones/M-004-conformite_chapitres_cours.md)/[`M-006`](project/milestones/M-006-conformite_labs.md) pour Kubernetes) pour le contenu non conforme au squelette ; les migrer rétroactivement n'est à faire que si explicitement demandé.


## Hiérarchie d'autorité

=== [redacted:private]
# AGENTS.md: [redacted:private]

Operational digest for coding agents working in this repository.

Fleet logbook: per-machine reports, incidents, state and operations (private).
[redacted:private] holds data and records about machines, not the tooling that lasts: reusable tools are built in `cem` (`silopolis/cles-en-main`), user configuration goes through `dotfiles` (public), small private settings live in `[redacted:repo]/cem/`.
Laid down from `darse` v0.2.0 (Copier, module `quality` only), so it follows the fleet conventions (`darse:DR-010`, `DR-011`, `DR-017`, `DR-022`, `DR-024`, `DR-025`).

## Authority order

1. `spec/drs/` (decisions, `DR-NNN`).
2. This file.
3. `project/` (roadmap, milestones, tasks): piloting, never norms.
4. READMEs: they relay and index, they never define a rule.

```


---

## Assistant (Explore · Claude Sonnet 5.5 · 4.2s)

_Thinking:_

**Tool: bash**

**Input:**
```json
{
  "command": "cd ~/Work && sed -n 1,30p cles-en-main/spec/drs/DR-007-opencode_generations_and_database_merge.md | cut -c1-500; rtk rg -n -i 'opencode|session' cles-en-main/README.md | head -15; rtk rg -n -i 'cem|tooling' [redacted:private]/AGENTS.md | head -8; sed -n 1,30p [redacted:private]/scripts/session/export.py"
}
```

**Output:**
```
---
id: DR-007
title: Two opencode generations, and merging the database rather than export/import
kind: decision
status: draft
domain: workstation
version: 0.1.0
created: 2026-10-28
updated: 2026-10-28
related_decisions:
  - id: DR-004
    role: see_also
---

# DR-007: Two opencode generations, and merging the database rather than export/import

## Intent

Decide how opencode histories from two machines are combined, and which opencode generation each machine runs.

## Context

Findings of 2026-10-28, from the omalap to [redacted:private] migration:

- Two generations share one database, `~/.local/share/opencode/opencode.db`: 1.19.x (`aqua:anomalyco/opencode`) and 2.0.x (`npm:@opencode/cli`).
- The schema level is the highest generation that ran: omalap has 50 `migration` rows (8 added on Oct 2, 4 on Oct 16 by 2.0.30); 1.19.x alone creates 38, the same as [redacted:private]'s database.
  1.x applies no migration and tolerates the 2.0 tables.
- 2.0's conversion of old sessions (`kv` key `migration.v1-v2`, table `session_v2`) is one-time: sessions created by 1.x afterwards have no `session_v2` row (241 on omalap).
- `opencode export` then `import` is lossy: the session is re-homed to the folder where the import runs (project becomes `global`) and the diff contents (`summary.diffs[].before` and `after`) are dropped.
- mise's newer registry maps the name `opencode` to the 2.x package, so `opencode = "latest"` flips generation silently; this happened on omalap through Omarchy's `~/.local/bin/opencode` wrapper (`mise use -g opencode`).
14:| [`memory/sessions/`](memory/sessions/) | Session notes |
36:mise run oc:cutover             # merge opencode history into the target host
6:[redacted:private] holds data and records about machines, not the tooling that lasts: reusable tools are built in `cem` (`silopolis/cles-en-main`), user configuration goes through `dotfiles` (public), small private settings live in `[redacted:repo]/cem/`.
58:- Every mutating task has an `apply` and a `revert`, and records what it did (system journal, identifier `cem`, and the root-owned spool `/var/log/cem/spool/`, under `/var/log` because a rollback of `@` would drop `/var/lib`).
69:- `machines/<machine>/`: `reports/`, `incidents/`, `data/`, `ops/<date>-<topic>/` (one-off scripts kept as acceptance references for the `cem` domains), `JOURNAL.md` (changes and incidents with the way to revert).
#!/usr/bin/env python3
"""Export an opencode session as a redacted Markdown transcript.

Steps: `opencode export` (JSON), conversion to the fleet's transcript format
(reasoning parts omitted, tool inputs and outputs truncated), redaction with
`session_redact.py`, then its `--check` and a dry run of `fix:secrets`.
It never applies a redaction by itself: findings are printed for the user.

Usage: export.py SESSION_ID --slug SLUG [--task T-NNN] [--out DIR]
"""

import argparse
import datetime
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

IN_LIMIT = 1500
OUT_LIMIT = 1200
REPO = Path(__file__).resolve().parents[2]
REDACT = Path(
    os.environ.get("SESSION_REDACT", "~/.config/nvim/scripts/session_redact.py")
).expanduser()


def stamp(ms):
    return datetime.datetime.fromtimestamp(ms / 1000).strftime("%m/%d/%Y, %I:%M:%S %p").lstrip("0")

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd ~/Work && sed -n 1,40p amiraute/project/tasks/T-096*.md | cut -c1-500; rtk rg -n -i 'export' istc/AGENTS.md | head -10; rtk ls istc/scripts | head -30; rtk rg -il 'redact' --glob '*.{py,sh,lua,md}' istc/scripts ~/.config/nvim 2>/dev/null | head"
}
```

**Output:**
```
---
id: T-096
title: "Proposal: an interim L0 record on parallel multi-agent execution (shared namespaces, invariants, hazards), until bosco (darse:T-069)"
status: ready
created: 2026-11-08
updated: 2026-11-08
target_repo: amiraute
workdir: [redacted:repo]
depends_on: []
related_decisions: [DR-001, DR-004, DR-014]
dispatch_origin: "darse:T-069"
---

# T-096: proposal, an interim L0 record on parallel multi-agent execution, shared namespaces, invariants and hazards, until `bosco` (`darse:T-069`)

## Goal

Decision owed by `amiraute`, not FYI-only.
Several fleet repositories now run, or are about to run, more than one coding agent at once, each task in its own git worktree, steered by an orchestrator through `herdr`.
Part of what that needs is shared by construction (one worktree directory for all repositories, one `herdr` agent namespace per server, global `mise` tasks used by several repositories, hazards that bite whichever repository hits them first) and no single repository can decide it alone.
The rest (the engine: pipelines, sub-agent sessions, review) is `istc`'s phase 8 work and then `bosco`'s (L2, `DR-001`), and is out of this proposal.
`darse` offers a narrow interim L0 record for the shared part, to be re-based onto `bosco` at Phase C0, and asks whether `amiraute` wants to write it, and in which form.
`darse` norms its own practice in its own records meanwhile (`darse:T-069`) and does not wait.

## Context digest

All facts below were measured or read on 2026-11-07 and 2026-11-08 by `darse`'s repo orchestrator (opencode session `ses_e633b719cffeUqI3augjsl6tpc`).
`darse:project/tasks/T-069-per_task_worktrees_and_herdr_orchestration.md` §Context digest holds the complete analysis (prior art, `herdr` facts, delivery pitfalls, read-only guard, the global worktree tasks against `darse:DR-017`, integration in local and forge modes, sessions, naming hierarchy, `.state/`, open questions); read it for anything this record only summarizes.
A French, self-sufficient copy went to `istc` as `istc:T-320`.

### Who runs this today

- `[redacted:repo]` (outside the fleet): coordinator `nvim-orch`, one change, one branch, one worktree, one `herdr` tab, one agent session; global tasks `scm:worktree:*` and `agent:dispatch` (chezmoi-managed, in `~/.config/mise/`).
- `opencode-readonly-guard` (outside the fleet): coordinator `rog-orch`, one `herdr` worktree workspace per workstream, worker briefs with a plan-first stage, scratch moving to a git-ignored `<repo>/.state/`.
- `istc`: the most complete written prior art, `istc:specs/contracts/CT-005-conventions_de_commit.md` §Worktrees et exécution parallèle (`R17` branch topology by type, `R19` serialization and one session per worktree), `istc:T-318` (repository prefix in worktree names), `istc:B-128` (a directory per task), `istc:project/milestones/D-008-execution_multi_agent_des_taches.md` (phase 8, parallel mode: isolation and orchestration "restent à concevoir").
- `darse`: starts now (`darse:T-065`, a first worker in a worktree), with `darse:T-068` (`.state/`) and `darse:T-069` (the norm).
- `[redacted:repo]` already studies "next-work and multi-agent coordination" (`CAP-WFL.003`, `CAP-COL.004`).

### What is shared by construction

54:Ce périmètre inclut, depuis [`T-132`](specs/drs/DR-014-regime_sessions_exports.md), la machinerie **nécessaire au fonctionnement propre du dépôt** portée localement plutôt que déléguée à un dépôt frère (`scripts/session/` : exporteur de session, porté depuis `[redacted:private]`) : `istc` reste autonome pour son propre outillage de pilotage en attendant une migration future vers `darse`/`bosco` (clause d'autonomie transitoire, [`DR-001`](specs/drs/DR-001-articulation_portefeuille_silopolis.md) §Triage permanent), plutôt que de dépendre d'un worktree frère pour fonctionner.
131:  Motif "merge porteur" de l'export de session et ses trailers `Session-ID:`/`Session-Export:`
140:- **Fin de session** : une session avec du contenu durable s'exporte avant de se clore (`mise run session:export`, [`memory/README.md`](memory/README.md)), régime déclenché en fin de session plutôt qu'à la clôture d'un lot ([`DR-014`](specs/drs/DR-014-regime_sessions_exports.md) §Déclencheur d'export, régime `amiraute` qui coexiste avec le motif "merge porteur" intégré par `task:close`/`milestone:close`, celui-ci ne le remplace pas).
141:  Pour un commit de pilotage direct hors merge porteur (`CT-005.R13`), `mise run session:export --attach` attache en un geste au commit `HEAD` l'export de la session et ceux de ses sessions filles (trailers, bases indexées et refus, dont celui d'un commit déjà publié : `CT-005.R14`, opt-in).
check/
commands/
lib/
milestone/
release/
review/
session/
task/
worktree/
istc/scripts/session/export.py
istc/scripts/task/close.py
istc/scripts/milestone/close.py
~/.config/nvim/ROADMAP.md
~/.config/nvim/README.md
~/.config/nvim/memory/sessions/README.md
~/.config/nvim/memory/sessions/202611080819-S22-refine-fleet-name-redaction.md
~/.config/nvim/AGENTS.md
~/.config/nvim/openspec/specs/session-transcripts/spec.md
~/.config/nvim/openspec/specs/session-workflow/spec.md

```


---

## Assistant (Explore · Claude Sonnet 5.5 · 4.9s)

_Thinking:_

**Tool: bash**

**Input:**
```json
{
  "command": "cd ~/Work && rtk rg -n 'GIT_DIR|GIT_|childEnv|env\\[' darse/tests/*.py darse/tests/lib -g '*.py' | head -8; rtk rg -n -i 'mock provider|openai-compatible|fake provider|scripted' darse istc cles-en-main amiraute --glob '!memory' --glob '!node_modules' -l | head; rtk ls [redacted:repo] | head; rtk rg -n -i 'CAP-COL.004|CAP-WFL.003' [redacted:repo] -l | head -3; ls istc/project/tasks | rtk rg 'T-320|B-128'; rtk rg -n -i 'permission|allow once|dialog' darse/project/tasks/T-069*.md | cut -c1-200 | head -5"
}
```

**Output:**
```
darse/tests/test_roundtrip.py:115:GIT_USER = "darse roundtrip harness"
darse/tests/test_roundtrip.py:116:GIT_EMAIL = "[redacted:email]"
darse/tests/test_roundtrip.py:160:    _run(["git", "config", "user.name", GIT_USER], cwd=path)
darse/tests/test_roundtrip.py:161:    _run(["git", "config", "user.email", GIT_EMAIL], cwd=path)
istc/cicd/jenkins/index.md
darse/project/tasks/T-049-sembr_guard_and_corpus_retrofit.md
darse/project/tasks/T-053-command_catalog_reference_and_guard.md
darse/project/milestones/M-008-first_docs_content.md
assets/
memory/
project/
scripts/
spec/
AGENTS.md  6.6K
README.md  1.3K
mermaid.config.json  26B
mise.toml  986B
ruff.toml  221B
[redacted:repo]/memory/ (21 files)
studies/bosco_greffe_preselection/decision_summary.md
studies/bosco_greffe_preselection/losses_and_opportunities.md
T-320-demande_d_inclusion_execution_parallele_par_worktree.md
85:- The orchestrator answers a worker's permission prompts with "Allow once" only, only for commands the guard's own checker allows plus scratch writes under `/tmp` and the worker's worktree; every a
91:  147 of 152 permission prompts were answered "always", which opencode keeps for the whole process; one quoted argument can hide several commands.
120:  - `agent_blocked` means an approval dialog waits for the user; `idle` or `done` does not prove that no unfamiliar dialog is open.
123:  - An "always" answer to a herdr permission prompt is stored by opencode as `herdr *` for the whole process.
248:- **D6, `.state/`** per `T-068`'s layout, with the measurements it left open (permission boundary, archive before removal).

```


---

## Assistant (Explore · Claude Sonnet 5.5 · 3.4s)

_Thinking:_

**Tool: bash**

**Input:**
```json
{
  "command": "cd ~/Work && rtk rg -n 'CAP-COL.004|CAP-WFL.003' [redacted:repo]/spec [redacted:repo]/memory -g '*.md' | cut -c1-260 | head -5; rtk ls ~/.config/nvim/scripts | head; rtk rg -n -i 'agent|opencode|harness' amiraute/spec/00-vision.md | cut -c1-250 | head -6; rtk ls darse/.state darse/.opencode 2>/dev/null | head"
}
```

**Output:**
```
208 matches in 21 files:

[redacted:repo]/.../sessions/202609151405-T-064-review_closure.md:3725:| Collaboration | `CAP-COL.001` through `CAP-COL.004` |
[redacted:repo]/.../sessions/202609151405-T-064-review_closure.md:4298:"patchText": "*** Begin Patch\n*** Update File: ~/Work/amiraute-bos...
[redacted:repo]/.../sessions/202609151405-T-064-review_closure.md:4320:"patchText": "*** Begin Patch\n*** Update File: ~/Work/amiraute-bos...
md_block_spacing.py  25.5K
md_common.py  7.8K
md_heading_spacing.py  10.1K
md_list_normalize.py  13.4K
md_modeline.py  3.5K
session_redact.py  39.8K
... (1 filtered)
[+1 hidden: rtk recall 69e70bccb82e0365]
13:Everything is built spec-driven, test-driven and agent-assisted.
17:Every new project, lab or training repeats the same bootstrap by hand: toolchain, quality gates, environments, conventions, agent operating model.
28:| `darse` | L1 | Copier-based project factory: base template + option modules, path-lifecycle doctrine, update round-trip harness, fleet updater (`radoub`) | to be born (M0.c) |
29:| `bosco` | L2 | generic ADLC engine: decisions, specs, tasks, milestones, memory (`greffe`), agent doctrine; CLI + template + doctrine | extracted at Phase C0 |
41:- Agents are first-class operators under explicit governance; every product ships its agent operating model.
47:- **Agentic scaffolding**: derived projects are born with their agent operating model (AGENTS.md, skills, commands) installed.
command/
skill/
archive/
briefs/
evidence/
tmp/
package-lock.json  14.3K
package.json  64B
journal.md  10.6K
... (3 filtered)

```


---

## Assistant (Explore · Claude Sonnet 5.5 · 27.9s)

**Research only. Nothing was edited or written.** All paths are under `~/Work/`. Where an id is cited, it is the file's own id.

## A. What darse already has or plans

| # | Candidate | darse today (path, id) |
|---|---|---|
| 1 | launch/retire-worker | **Not built.** `darse/project/tasks/T-069-per_task_worktrees_and_herdr_orchestration.md` (status `blocked` on T-058) norms per-task worktrees and herdr orchestration. Its D5 says the close path is darse's own and honours `dev` and `merged/<source>`. `B-025` (manual close sequence) is folded in, and an open question asks whether to build a `task:close` or `worktree:close` task. The retire path was done by hand for T-065 (`project/roadmap.md`, entry 2026-11-08). |
| 2 | watch/once/peek | **Not found as code.** T-069 §3.2 and §5 describe the "Allow once only for guard-allowed commands" practice and the read-only guard's effect on an orchestrator. T-069 §4 holds the herdr pitfalls (prompt delivery, `agent_blocked`, no `@` in prompts). |
| 3 | export-sessions | `darse/.mise/tasks/session/export` is a stub: "manual for now". `docs/reference-commands.md:41` calls it transitional. `DR-016` has the boarding protocol, point 6. `DR-025` plus `CT-011` and `mise run fix:secrets` (template task `template/.mise/tasks/fix/secrets`, with `--apply`, all-or-nothing) cover redaction. `docs/reference-quality-module.md:51-54` says `memory/sessions/**` is excluded from format checks but not from the secret scan. `darse/memory/sessions/` holds the orchestrator exports. The T-069 roadmap entry says they were made with "istc's exporter, `--full`" (`istc/scripts/session/export.py`). |
| 4 | deploy-main | **Not found.** darse has `dist/`, but no live-build hazard doc. |
| 5 | make-brief + template | T-069 §13 "Brief anatomy for a worker" gives the anatomy: identity, coordinator, authority, hard limits, plan first, reporting `READY-REVIEW/READY-MERGE/BLOCKED`, close sequence. Its first rule is "The task record is the real brief" (`DR-010` §Task briefs and piloting files). T-069 D8 says workers plan first and wait for the go. No generator or template file. |
| 6 | `.state/` convention | **Adopted.** `project/tasks/T-068-state_dir_for_orchestration.md` (done) uses a `.gitignore` line, not `.git/info/exclude`, because markdownlint only reads `.gitignore`. The layout is `briefs/ evidence/ tmp/ archive/<task>/ journal.md`. T-069 §12 and D6 are about to norm it. T-069 §14 leaves open "Whether the template ships the layout (`M-009` `agentic` module)". |
| 7 | research-worker pattern | **Not found.** No darse record names a read-only plan, go, report.md, evidence/, prototype/ pattern. |
| 8 | session re-root | **Not found in darse.** The nearest is `cles-en-main/spec/drs/DR-007-opencode_generations_and_database_merge.md` (status draft): merge `opencode.db` rather than export/import, because import re-homes the project to `global`. cem has the task `oc:cutover` (`cles-en-main/README.md:36`). |
| 9 | sandbox env hygiene / GIT_* | T-069 D7 "hazards are rules" includes "scrub `GIT_*` in test helpers" and "list variable names only". `darse/tests/test_roundtrip.py` and `tests/generated_projects.py` have no env scrub. A secret-name denylist is not found. |
| 10 | mock provider | **Not found** in darse, istc, cles-en-main or amiraute. |

Other darse facts:
- `DR-005` line 44 defines the planned `agentic` module as "AGENTS.md instantiation, `.agents/` skills+commands, a sync mechanism". It sits in `M-009` (`project/milestones/M-009-quality_env_agentic_secrets_ci_modules.md`, ready).
- `DR-020` §Agent interface and `.opencode/command/*.md` only cover docs commands.
- `project/tasks/T-070-hk_upgrade_or_replacement.md` (B-027) is the hk stash race that blocks parallel worktrees.

## B. Fleet repositories and what each owns

Source: `amiraute/spec/01-portfolio.md`, "Repos" table, and `amiraute/spec/drs/DR-001-four_layer_ecosystem_model.md`.

| Repo | Layer | Role |
|---|---|---|
| amiraute | L0 | coordination |
| darse | L1 | project factory (Copier, toolchain pins, quality gates). `darse/AGENTS.md`: "contains no domain content" |
| bosco | L2 | "ADLC engine", "dormant, not born", extracted at Phase C0. `amiraute/spec/00-vision.md:29` lists "decisions, specs, tasks, milestones, memory, agent doctrine; CLI + template + doctrine" |
| [redacted:private] | L3 (+ legacy) | training framework |
| cles-en-main (cem) | L3 | workstation lifecycle, "reusable tools are built in cem" (`[redacted:private]/AGENTS.md:6`) |
| [redacted:private] | data | fleet logbook, "holds data and records about machines, not the tooling that lasts" |
| istc | L4 | knowledge base. Its `AGENTS.md:54` carries `scripts/session/` (exporter ported from [redacted:private]) "pending a future migration to darse/bosco". Phase 8 `D-008` (`istc/project/milestones/D-008-execution_multi_agent_des_taches.md`) leaves orchestration "à concevoir" |
| [redacted:repo], gymnase | L4, L5 | deployment fork, labs platform (dormant) |
| `[redacted:repo]` (`~/.config/nvim`) | outside the fleet | has the redactor `scripts/session_redact.py` and its own orchestration experiment |
| opencode-readonly-guard | outside the fleet | this repo |

**No existing or planned repository for opencode, agent-harness or orchestration tooling: not found.**

The closest candidates:
- `bosco` (L2): `amiraute/spec/drs/DR-001-four_layer_ecosystem_model.md` places agent doctrine, tasks and memory there.
- `amiraute/project/tasks/T-096-darse_interim_l0_parallel_execution_proposal.md` (ready, a decision owed by amiraute). It says the shared part is an interim L0 record, "re-based onto bosco at Phase C0".
- `istc:T-320` (`istc/project/tasks/T-320-demande_d_inclusion_execution_parallele_par_worktree.md`) is the French copy of T-069 for istc phase 8.

T-096 and T-069 already name opencode-readonly-guard and `rog-orch` as prior art. The shared global tasks (`~/.config/mise/tasks/scm/worktree/*` and `agent:dispatch`) are chezmoi-managed. T-069 says they are to be ported into istc/bosco.

## C. Best fit

| # | Fit | Reasoning |
|---|---|---|
| 1 launch/retire | Stay private for now, then feed T-069/T-096/T-320 | Already the subject of three open records; building a fourth version would collide with the planned `task:close`/`worktree:close` (B-025). The real home is bosco/istc phase 8. Send the scripts as prior art, not as a repo. |
| 2 watch/once/peek | Stay private, or a new "agent-harness" repo if one is created | Tied to this repo's policy checker (the guard's `check`), which it calls to decide. It has no fit in darse (a factory with no domain code) or in cem (workstation). |
| 3 export-sessions | istc (generalise its `scripts/session/export.py`), plus a darse `session:export` that calls it | darse's task is a stub awaiting an implementation. istc owns the exporter and its clause says "future migration to darse/bosco". The nvim redactor stays where it is. Only the wrapper (NUL scrub, extra terms, verify) is new, so it fits as an option or a patch. |
| 4 deploy-main | Stay private | It is specific to this plugin's live `dist/`. The idea (atomic swap, rollback) is generic, but no fleet repo has a live `dist/` hazard. |
| 5 make-brief + template | darse convention (T-069 §13, `DR-017` or a new DR) | T-069 already specifies the brief anatomy. Fold the template into T-069, or into the planned `agentic` module (`DR-005` line 44). |
| 6 `.state/` | darse convention (T-068, T-069 D6), possibly the template's `agentic` module | Already adopted in darse's `.gitignore` and extended in T-069 §12. This repo's own use (`.state/<agent>/` plus `tmp/`) is the origin. Align the layouts: T-068 has `briefs/ evidence/ tmp/ archive/`, this repo uses `briefs/ bin/ evidence/ notes/ tmp/`. |
| 7 research-worker | darse convention (a DR or doc under orchestration) | Not covered anywhere. Natural next to T-069 §13 as a worker kind. |
| 8 re-root | cem (cles-en-main) | Same subject as `DR-007` (opencode.db, re-homing); cem is where "reusable tools" live. Needs the maintainer's decision. |
| 9 sandbox env hygiene | darse convention (T-069 D7, `tests/README.md`), plus a template test helper | Already a rule ("scrub GIT_*", "list names only") with no implementation. The credential denylist is new. Offer it as a pattern, kept in the helper here. |
| 10 mock provider | New repository (agent-harness) or stay private | Not found anywhere in the fleet. It is generic to opencode, with no darse or cem fit. Weak case for a new repo unless 2 and 10 are grouped. |

Notes for the maintainer:
- One open decision, not a gap: should an "agent-harness" repo exist? Candidates 2 and 10, and perhaps 4, would justify it. The fleet's own answer (T-096) is to wait for bosco.
- The next obvious step is T-069 and `istc:T-320`, not a new repo. They are `blocked` on T-058 and on amiraute's reply to T-096.

---

