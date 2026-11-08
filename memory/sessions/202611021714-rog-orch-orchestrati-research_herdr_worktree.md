# Research herdr worktree semantics (@explore subagent)
**Session ID:** ses_e62f52903ffeTa4xelPxCnylPV
**Parent Session ID:** ses_e6320a0e1ffexOEYp4Zi3QELSa
**Created:** 11/2/2026, 5:14:55 PM
**Updated:** 11/2/2026, 5:15:19 PM
<!-- session-export: through msg_19d0af0a3001EjMaqkOoiSna5u -->
<!-- session-children: -->

---

## User

Research task only (no code, no file writes). Fetch these herdr v0.9.5 docs and extract EVERYTHING about git worktree support ("herdr worktree create|open|list|remove", linked worktree workspaces, workspace groups, "workspace close --group", --trust-repository, where worktree checkouts are placed on disk, branch naming, what happens to the worktree directory/branch on remove, how worktree workspaces appear in the sidebar/workspace list, any config keys for worktree location):
- https://raw.githubusercontent.com/herdrdev/herdr/v0.9.5/docs/next/website/src/content/docs/cli-reference.mdx
- https://raw.githubusercontent.com/herdrdev/herdr/v0.9.5/docs/next/website/src/content/docs/concepts.mdx
- https://raw.githubusercontent.com/herdrdev/herdr/v0.9.5/docs/next/website/src/content/docs/agent-automation.mdx
- If needed, https://raw.githubusercontent.com/herdrdev/herdr/v0.9.5/docs/next/website/src/data/config-reference.json (filter for keys containing "worktree")
Also extract from these docs: options of "herdr tab create" and "herdr workspace create", and anything about session restore of agents (do opencode agents get resumed after herdr restart?) from https://raw.githubusercontent.com/herdrdev/herdr/v0.9.5/docs/next/website/src/content/docs/session-state.mdx.
Return a concise factual summary (bullet points, quote exact flags/option names and defaults), max ~60 lines. Note explicitly anything the docs do NOT say.

---

## Assistant (Explore · Claude Sonnet 5.5 · 3.6s)

**Tool: webfetch**

**Input:**
```json
{
  "url": "https://raw.githubusercontent.com/herdrdev/herdr/v0.9.5/docs/next/website/src/content/docs/cli-reference.mdx",
  "format": "text"
}
```

**Output:**
```
---
title: CLI reference
description: Herdr commands for sessions, workspaces, tabs, panes, notifications, agents, waits, integrations, and status.
---

Herdr’s CLI talks to the running server over the same local socket API used by integrations and agents.

Most commands print JSON responses for deterministic automation in scripts.

## Launch and status

```bash
herdr                         # launch or attach to the default session
herdr --remote workbox        # attach through SSH, using local keybindings
herdr --default-config        # print default config
herdr update                  # download and install from the configured channel
herdr completion zsh          # generate a zsh completion script
herdr channel show            # print stable or preview
herdr channel set preview     # opt into preview builds
herdr channel set stable      # return a direct install to stable
herdr --version               # print version
```

Optional launch and update settings:

- Add `--session <name>` to use a named session instead of the default.
- Add `--remote-keybindings server` to remote attach to use server keybindings instead of local ones.
- Experimental live handoff requires explicit `--handoff` on `herdr --remote` or `herdr update`. It is not the normal setup or connection path; see [Updates](/docs/install/#update).

Status commands:

```bash
herdr status
herdr status server
herdr status client
```

API schema commands:

```bash
herdr api schema
herdr api schema --json
herdr api schema --output herdr-api.schema.json
```

`herdr api schema` prints a short summary of the socket protocol schema bundled
with the installed binary. Use `--json` for the full JSON Schema document, or
`--output PATH` to write that document to a file.

## Saved SSH machines

```bash
herdr machine list
herdr machine add workbox
herdr machine add workbox --label "Build machine"
herdr machine rename <profile-id> --label "New name"
herdr machine disable <profile-id>
herdr machine enable <profile-id>
herdr machine remove <profile-id>
```

In an interactive terminal, `machine add` discovers running sessions and lets you choose when several are running. No running sessions, or no Herdr installation, uses `default`; failed queries against an installed binary require an explicit choice. Add `--remote-session <name>` to skip discovery. Non-interactive commands use `default` unless that flag is supplied. `machine list` accepts optional `--json` for scripts. See [Connecting machines](/docs/connecting-machines/) for the full setup and connection guide.

`machine add` checks the remote installation's capabilities, installs or updates with approval only when needed, and starts the requested session's background server before saving. Compatible release versions do not need to match. Run setup in an interactive terminal when installation or restart approval is required; failed or cancelled setup does not save a profile. Replacing a running server requires explicit approval with a default answer of No, and stops its pane processes. `machine add` never enables experimental handoff implicitly.

Changes apply automatically to open local Herdr clients, normally within a second. Added or enabled machines connect in the background; renaming does not reconnect. Removing or disabling disconnects only that machine and leaves its remote sessions running. Removing the machine you are viewing returns to Local, or shows Local as unavailable until it reconnects. Each profile stores an opaque ID, label, SSH target, explicit remote session, and enabled state in client state. Herdr does not store passwords, private keys, or other SSH credentials.

Use `herdr machine status [<label-or-id>] [--json]` for fresh, noninteractive SSH and remote Herdr checks. `reachable` describes this check, not a TUI's current connection. Use `herdr machine reconnect <label-or-id>` in a terminal for SSH authentication and verification; it does not install or update Herdr. Open clients retry failed connections within 30 seconds. Clicking `! auth` or `! error` shows the latest error and CLI guidance; collapsed sidebars show `!`. See [Recovering SSH authentication](/docs/connecting-machines/#recovering-ssh-authentication) for platform limits. For remote setup, use `herdr --remote workbox`, adding `--session <name>` only for a named session.

Workspace, tab, pane IDs, and agent names belong to a single server. Selecting a machine in the UI does not retarget CLI commands. Use the global **prefix** `--machine <label-or-id>` to route API commands to a saved SSH machine:

```bash
herdr --machine "Build machine" agent list
herdr --machine <profile-id> pane list
herdr --machine "Build machine" agent prompt w1:p1 "review this change"
herdr --machine "Build machine" worktree create --cwd /srv/project --branch review
```

The selector must match an enabled saved profile ID or a unique, case-sensitive label, not an arbitrary SSH hostname. The saved remote session is used; combining `--machine` with `--session` or `--remote` is an error. Without the prefix, commands retain their existing local session/socket behavior.

Supported commands are `workspace`, `worktree`, `tab`, `pane`, `notification`, `agent` (except `attach` and local `explain --file`), `api snapshot`, `status server`, and API-backed plugin commands (`link`, `unlink`, `enable`, `disable`, `list`, `action`, `log`, `pane`). Server commands support `stop`, `reload-config`, `agent-manifests`, and `reload-agent-manifests`. Local installation/configuration commands, plugin installation, session management, and interactive terminal attachment are not forwarded.

Requests and responses travel through the JSON API over non-interactive SSH; API payloads are not interpolated into the SSH shell command. No open TUI is required, and the bridge never installs, starts, or restarts a server. Update the local CLI and remote Herdr installation to support machine forwarding, and keep the running remote server's API protocol compatible. Authentication, unavailable machines, and incompatible versions fail without falling back to Local. Requests are not automatically retried after connection failure.

Local pane IDs are not inherited by remote commands. Use explicit remote IDs; `--current` cannot refer to the caller's local pane. Remote worktree paths must be absolute, `~`, or start with `~/` (expanded on the server); plugin link paths must be absolute. The prefix targets one machine at a time; combined listings and routing through another TUI's connections are not included.

## Shell completions

```bash
herdr completion zsh
herdr completions zsh
herdr completion bash
herdr completion fish
herdr completion powershell
herdr completion elvish
```

`completion` prints the script to stdout. `completions` is an alias. For a
temporary zsh session, load the script directly:

```bash
source <(herdr completion zsh)
```

For a persistent zsh setup, write the generated `_herdr` function somewhere on
your `fpath` before `compinit` runs:

```bash
mkdir -p ~/.zfunc
herdr completion zsh > ~/.zfunc/_herdr
```

Then make sure your `.zshrc` contains:

```zsh
fpath=(~/.zfunc $fpath)
autoload -Uz compinit
compinit
```

## Server

```bash
herdr server
herdr server stop
herdr server reload-config
herdr server agent-manifests [--json]
herdr server update-agent-manifests [--json]
herdr server reload-agent-manifests
```

`herdr server` runs the headless server explicitly. Use it for supervised or service-style setups. `reload-config` applies reloadable settings without restarting panes. `agent-manifests` shows the active agent detection manifest sources, cached remote versions, and last remote update results. `update-agent-manifests` fetches remote manifest updates immediately, reloads them into the running server, and prints the updated manifest status; pass `--json` for the raw status response. `reload-agent-manifests` reloads agent detection manifests into the running server after local override edits.

## Notifications

```bash
herdr notification show <title> [--body TEXT] [--position top-left|top-right|bottom-left|bottom-right] [--sound none|done|request]
```

`notification show` uses the configured `[ui.toast]` delivery. `--position` only affects in-app Herdr toasts. `--sound` defaults to `none`; `done` and `request` play the existing finished and needs-attention sounds only when the notification is shown.

## Sessions

```bash
herdr session list [--json]
herdr session attach <name>
herdr session stop <name> [--json]
herdr session delete <name> [--json]
```

Use `default` as the session name when you need to stop the default session explicitly.

## Workspaces

```bash
herdr workspace list
herdr workspace create [--cwd PATH] [--label TEXT] [--env KEY=VALUE] [--focus] [--no-focus]
herdr workspace get <workspace_id>
herdr workspace focus <workspace_id>
herdr workspace rename <workspace_id> <label>
herdr workspace report-metadata <workspace_id> --source ID [--token NAME=VALUE] [--clear-token NAME] [--seq N] [--ttl-ms N]
herdr workspace close <workspace_id> [--group]
```

Create a workspace without stealing focus:

```bash
herdr workspace create --cwd ~/project --label api --no-focus
```

A workspace is a top-level project or work context. Creating one also creates its first tab and root pane. The JSON response exposes their IDs as `.result.workspace.workspace_id`, `.result.tab.tab_id`, and `.result.root_pane.pane_id`.

## Worktrees

```bash
herdr worktree list [--workspace ID | --cwd PATH] [--trust-repository]
herdr worktree create [--workspace ID | --cwd PATH] [--branch NAME] [--base REF] [--path PATH] [--label TEXT] [--focus] [--no-focus] [--trust-repository]
herdr worktree open [--workspace ID | --cwd PATH] (--path PATH | --branch NAME) [--label TEXT] [--focus] [--no-focus] [--trust-repository]
herdr worktree remove --workspace ID [--force] [--trust-repository]
```

Worktrees are normal Herdr workspaces with Git checkout provenance. `worktree create` creates a Git worktree checkout, opens it as a workspace, and groups it with the parent repo workspace. If `--branch` names an existing local branch, Herdr checks it out; otherwise it creates the branch from `--base` or `HEAD`. Without `--path`, Herdr creates the checkout under `<worktrees.directory>/<repo>/<branch-slug>`.

`workspace close` closes only Herdr state. Closing a primary workspace while linked-worktree workspaces are open requires `--group`; without it, the command leaves the group open and returns `workspace_group_close_required`. To delete the checkout, run `worktree remove`. It runs `git worktree remove`, never deletes the branch, and requires `--force` when Git refuses a dirty checkout.

Git rejects repositories owned by another user by default. If you have independently verified the repository, pass `--trust-repository` to trust its resolved path for that command only. Herdr does not change your Git configuration.

## Tabs

```bash
herdr tab list [--workspace <workspace_id>]
herdr tab create [--workspace <workspace_id>] [--cwd PATH] [--label TEXT] [--env KEY=VALUE] [--focus] [--no-focus]
herdr tab get <tab_id>
herdr tab focus <tab_id>
herdr tab rename <tab_id> <label>
herdr tab close <tab_id>
```

A tab is another terminal layout inside a workspace. Without `--workspace`, `tab create` uses the active workspace and fails if none exists. Its JSON response exposes `.result.tab.tab_id` and `.result.root_pane.pane_id`. Closing a workspace's last tab also closes the workspace, matching the TUI close-tab action. If `confirm_close` is enabled and closing the tab would also close a whole worktree group, `tab close` returns a `confirmation_required` error instead.

With `ui.confirm_close` enabled, the TUI asks for confirmation before closing a workspace's last tab or its only pane from a keybinding or the tab/pane menu. Ordinary pane closes and CLI/API closes remain immediate.

Workspace and tab creation, and pane splitting, leave focus unchanged by default. `--focus` selects the new layout; `--no-focus` states the default explicitly. Without `--cwd`, new terminals follow the configured `terminal.new_cwd` policy, which follows the source pane or workspace by default. Each `--env KEY=VALUE` adds or replaces that variable in the new root shell.

## Panes

```bash
herdr pane list [--workspace <workspace_id>]
herdr pane current [--pane ID|--current]
herdr pane get <pane_id>
herdr pane layout [--pane ID|--current]
herdr pane process-info [--pane ID|--current]
herdr pane neighbor --direction left|right|up|down [--pane ID|--current]
herdr pane edges [--pane ID|--current]
herdr pane focus --direction left|right|up|down [--pane ID|--current]
herdr pane resize --direction left|right|up|down [--amount FLOAT] [--pane ID|--current]
herdr pane zoom [<pane_id>|--pane ID|--current] [--toggle|--on|--off]
herdr pane rename <pane_id> <label>|--clear
herdr pane input [<pane_id>|--pane ID|--current] --right-click herdr|pane
herdr pane split [<pane_id>|--pane ID|--current] --direction right|down [--ratio FLOAT] [--cwd PATH] [--env KEY=VALUE] [--right-click herdr|pane] [--focus] [--no-focus]
herdr pane swap --direction left|right|up|down [--pane ID|--current]
herdr pane swap --source-pane ID --target-pane ID
herdr pane move <pane_id> --tab <tab_id> --split right|down [--target-pane ID] [--ratio FLOAT] [--focus|--no-focus]
herdr pane move <pane_id> --new-tab [--workspace ID] [--label TEXT] [--focus|--no-focus]
herdr pane move <pane_id> --new-workspace [--label TEXT] [--tab-label TEXT] [--focus|--no-focus]
herdr pane close <pane_id>
```

For pane commands that accept `--current`, Herdr uses the calling pane's
`HERDR_PANE_ID` when the command runs inside a Herdr pane. For `pane split`,
an explicit pane id or `--pane ID` splits that pane. An omitted target splits
the calling pane when `HERDR_PANE_ID` is available, otherwise the focused pane.
`--current` requires a calling pane and errors when `HERDR_PANE_ID` is unavailable.
The split response exposes the new pane ID as `.result.pane.pane_id`.

`pane input --right-click pane` forwards unmodified right-click gestures to a
mouse-reporting pane application. `herdr` restores the default pane menu.
Right-clicking the pane frame still opens Herdr's menu. `pane split
--right-click pane` applies the same policy to the new pane at creation.

After `pane move`, use `.result.move_result.pane.pane_id` for later commands. A cross-workspace move changes the workspace-qualified pane ID; the prior value remains at `.result.move_result.previous_pane_id`. The running process keeps its launch-time `HERDR_PANE_ID`, `HERDR_TAB_ID`, and `HERDR_WORKSPACE_ID`; Herdr retains the old pane ID as an alias for that terminal, so pane commands using `--current` still resolve it. A live agent name follows the terminal and continues to resolve after the move.

Read output:

```bash
herdr pane read <pane_id> [--source visible|recent|recent-unwrapped|detection] [--lines N] [--format text|ansi] [--ansi] [--raw]
herdr pane read <pane_id> --source visible --ansi
herdr pane read <pane_id> --source recent-unwrapped --lines 120
```

`pane read` prints UTF-8 terminal text directly. ANSI escapes are stripped by default; use `--format ansi` or `--ansi` to preserve them where the source exposes styling. The `detection` source is always plain text. For recent sources, `--lines N` selects the last N rendered terminal rows before optional unwrapping; without it, reads default to 80 rows. For `visible` and `detection`, omitting `--lines` returns the full snapshot, while specifying it keeps the last N newline-delimited lines. `agent read` uses the same output and line behavior.

Send input:

```bash
herdr pane send-text <pane_id> <text>
herdr pane send-keys <pane_id> <key> [key ...]
herdr pane run <pane_id> <command>
```

`<key>` uses Herdr key-combo syntax: plain printable keys such as `a`,
special keys such as `enter`, `tab`, `esc`, `backspace`, `left`, `right`,
`up`, and `down`, modifier chords such as `ctrl+h`, `control+j`, `alt+x`,
and `shift+tab`, function keys such as `f1`, and named punctuation such as
`minus`, `plus`, and `backtick`. Legacy `C-c` and `c-c` are accepted as
aliases for `ctrl+c`.
`esc` is the canonical spelling; `escape` is also accepted.

`pane run` honors live bracketed-paste mode and submits text plus Enter atomically. Prefer it over `send-text` plus `send-keys Enter` for commands; the separate send operations remain low-level and non-submitting.

Report agent state from custom hooks:

```bash
herdr pane report-agent <pane_id> \
  --source ID \
  --agent LABEL \
  --state idle|working|blocked|unknown \
  [--message TEXT] \
  [--seq N] \
  [--agent-session-id ID] \
  [--agent-session-path PATH] \
  [-- RESUME_COMMAND...]

herdr pane report-agent-session <pane_id> \
  --source ID \
  --agent LABEL \
  [--seq N] \
  [--agent-session-id ID] \
  [--agent-session-path PATH] \
  [--session-start-source SOURCE] \
  [-- RESUME_COMMAND...]

herdr pane release-agent <pane_id> \
  --source ID \
  --agent LABEL \
  [--seq N]
```

`report-agent-session` updates native session identity without reporting lifecycle state. `release-agent` ends that source's lifecycle authority when its agent process exits.

Arguments after `--` are the command Herdr runs to resume this session after a server restart. The first argument must be a plain command name on `PATH`, and no argument may contain an apostrophe.

`pane get`, `pane list`, `agent get`, and `agent list` include a read-only `agent_session` object when an official integration has reported a native session reference. If no native session reference is stored, the field is omitted.

Those commands include `foreground_cwd` when Herdr can resolve the cwd of the foreground process controlling the pane. The `cwd` field remains the pane/workspace cwd used for labels and follow-cwd behavior.

`pane get` and `pane list` include `scroll` when terminal scroll metrics are available. `scroll.offset_from_bottom == 0` means the pane is at the bottom of its scrollback.

Report display-only pane metadata without taking over semantic state:

```bash
herdr pane report-metadata <pane_id> \
  --source ID \
  [--agent LABEL] \
  [--applies-to-source ID] \
  [--title TEXT|--clear-title] \
  [--display-agent TEXT|--clear-display-agent] \
  [--state-label STATUS=TEXT] \
  [--clear-state-labels] \
  [--token NAME=VALUE] \
  [--clear-token NAME] \
  [--seq N] \
  [--ttl-ms N]
```

`STATUS` is one of `idle`, `working`, `blocked`, `done`, or `unknown`. `--agent` and `--applies-to-source` guard only `--title`, `--display-agent`, and `--state-label`. They do not guard token patches; token reporters own clearing or TTL refresh. Use `--display-agent` to change the visible name.

Metadata text is normalized before storage. Herdr trims surrounding whitespace, removes control characters, and caps `--title`, `--display-agent`, each `--state-label`, and token values at 80 characters. Empty normalized token values clear that key.

`--token` patches one named display value; `--clear-token` removes one. Unmentioned tokens remain unchanged. Pane tokens are available to Agent sidebar rows as `$name`; workspace tokens are available to Space rows. TTL applies independently to the token keys updated by that call.

`--source` and `--applies-to-source` must be 80 characters or fewer and may contain only ASCII letters, digits, colon, dot, underscore, and hyphen. `--ttl-ms` makes metadata expire automatically and must be between `1` and `86400000` milliseconds. Omit it for metadata that should stay until replaced, cleared, or the pane closes. `--seq` lets Herdr ignore stale reports from the same `--source`; stale reports are accepted by the API but ignored by pane state. A pane or workspace accepts sequenced token reports from at most 32 distinct sources during its lifetime; clearing or expiry does not release those source slots.

## Agents

For the pane-versus-agent model and complete orchestration examples, see [Agent automation](/docs/agent-automation/).

```bash
herdr agent list
herdr agent get <target>
herdr agent read <target> [--source visible|recent|recent-unwrapped|detection] [--lines N] [--format text|ansi] [--ansi]
herdr agent send-keys <target> <key> [key ...]
herdr agent prompt <target> <text> [--wait] [--until STATUS]... [--timeout MS]
herdr agent rename <target> <name>|--clear
herdr agent focus <target>
herdr agent wait <target> [--until STATUS]... [--timeout MS]
herdr agent attach <target> [--takeover]
herdr agent start <name> --kind KIND --pane ID [--timeout MS] [-- <agent-args...>]
herdr agent explain <target> [--json|--verbose]
herdr agent explain --file PATH --agent LABEL [--json|--verbose]
```

Agent targets are either a unique live agent name or the pane ID that currently hosts the agent. Terminal IDs and bare agent-kind labels are not agent targets. Agents started through `agent start` require a name; manually launched agents remain unnamed and use their pane ID.

`agent start` activates an existing available shell pane: the pane's interactive shell must own the foreground, with no foreground command, editor, or agent running. Topology must be created separately. Names are unique among live agents and must match `[a-z][a-z0-9_-]{0,31}`. The kind selects Herdr's canonical interactive executable, while arguments after `--` are passed to that executable. Supported kinds are `pi`, `claude`, `codex`, `gemini`, `cursor`, `devin`, `agy`, `cline`, `omp`, `mastracode`, `opencode`, `copilot`, `kimi`, `kiro`, `droid`, `amp`, `grok`, `hermes`, `kilo`, `qodercli`, `qwen`, `letta`, `maki`, and `muse`. A name follows the current pane occupant and is cleared when that agent exits, is released, or is replaced. Temporary detection uncertainty does not clear it.

A successful start returns only after the expected agent owns the same terminal and is ready for interactive input. If detection reports `blocked` during startup, the command returns `agent_not_ready` immediately. The name remains available for `agent read` and `agent send-keys`, and becomes ready for prompts after detection reports `idle`. The default startup timeout is 30000 milliseconds; explicit values must be greater than 3000 and no more than 300000.

`agent prompt` honors live bracketed-paste mode and writes text followed by delayed Enter as one ordered submission, including while the agent is working. Success without `--wait` acknowledges the writes, not the start of a turn. On Windows, Codex receives a paste boundary before Enter so submission does not depend on prompt size; the caller timeout includes submission time. If the agent is already `blocked`, it returns `agent_blocked` without sending input. With `--wait`, a prompt sent from another non-working state has up to five seconds after submission to produce an observed `working` or `blocked` state or Herdr returns `agent_prompt_stalled`; if the caller timeout expires first, Herdr returns the normal `timeout` error. This prevents unrelated `idle`, `done`, or session changes from completing the wait. After activity is observed, it waits for the first requested settled status. It does not track individual turns. If the agent is already working, completion of that active turn may satisfy the wait. `--until` narrows the matching states and is rejected unless `--wait` is also present. Standalone `agent wait` returns immediately when the current status matches. Both default to `idle`, `done`, or `blocked`; use `--until unknown` explicitly when needed.

`idle` and `done` both mean ready for input. The CLI/API uses the server's seen state: `done` is idle but not yet marked seen, explicit `pane focus` / `agent focus` commands mark the target seen, and reads do not. Each TUI client tracks viewed completions independently, so its Done badge can differ from the CLI or another client. `blocked` means Herdr recognized an approval or question UI. `unknown` means an agent is present but Herdr cannot classify it confidently, not that its work succeeded.

`agent send-keys` sends logical terminal keys such as `enter`, `up`, `esc`, or `ctrl+c`. Herdr validates every key before writing any bytes. `agent read` reads the resolved terminal stream, and `agent rename` names an already detected agent.

`agent explain` asks the running server to classify the same bottom-buffer detection snapshot used by screen detection, so live output reflects the server's active manifest cache. Because this uses the `agent.explain` socket method, restart or hand off to an updated server after upgrading Herdr before using live explain. Use `--file PATH --agent LABEL` to explain a saved fixture locally instead. The default output shows the agent, final state, manifest source and version, matched rule with its region evidence, and any fallback, skip, or warning reasons. Add `--verbose` for visible evidence flags, cached remote version, local override shadowing, remote update status, and the full evaluated-rules list with matcher and region evidence. Add `--json` for issue reports or tests.

Use `pane send-text`, `pane send-keys`, `pane run`, and `terminal attach` for ordinary terminals, servers, tests, shells, or low-level terminal control. Use `pane run` when you want to submit a command with Enter.

## Direct terminal attach

```bash
herdr terminal attach <terminal_id> [--takeover]
herdr terminal session control <target> [--takeover] [--cols N] [--rows N]
herdr terminal session observe <target> [--cols N] [--rows N]
herdr terminal title set <title>
herdr terminal title clear
```

Detach from direct attach with `ctrl+b q`. Send literal `ctrl+b` with `ctrl+b ctrl+b`.
`terminal session control` opens a writable live terminal stream for a pane,
terminal, or agent target. It prints the same newline-delimited
`terminal.frame` and `terminal.closed` records as observe mode. It reads
newline-delimited JSON commands on stdin: `terminal.input`, `terminal.resize`,
`terminal.scroll`, `terminal.mouse`, and `terminal.release`. One controller can
own a terminal at a time; use `--takeover` to replace it.
`terminal.mouse` sends one mouse event at a zero-based cell of the controller's
viewport, for example
`{"type":"terminal.mouse","action":"down","button":"left","column":12,"row":5}`.
`action` is `down`, `up`, `drag`, or `move`; `button` is `left` (default),
`right`, or `middle`; `modifiers` is optional and combines Shift = 1, Ctrl = 2,
and Alt = 4 (default 0). A click is `down` followed by `up`. Herdr encodes the
event for the application's mouse mode and drops it when the application has
not enabled mouse reporting, so a plain shell never receives stray input.
`move` reaches only applications that track all mouse motion.
`terminal session observe` opens a read-only live terminal stream for a pane,
terminal, or agent target. It prints newline-delimited JSON `terminal.frame`
records with base64-encoded ANSI bytes, then a `terminal.closed` record when
the server closes the stream. Multiple observers can watch the same terminal
without taking input, resize, scroll, or takeover authority.
On Linux and macOS, an observer is disconnected if a socket write makes no progress
for 30 seconds. A stalled stream can end without a final `terminal.closed` record;
the pane and other clients keep running. Quiet panes do not trigger this timeout.
`terminal title clear` hands the outer terminal window title back to `ui.window_title`.

## Output waits

Wait for output in a pane:

```bash
herdr pane wait-output <pane_id> (--match <text> | --regex <pattern>) [--source visible|recent|recent-unwrapped] [--lines N] [--timeout MS] [--raw]
```

Use `pane wait-output` for normal commands and servers. Use `agent wait` for coding agents.

`pane wait-output` checks the selected snapshot immediately, including output that already exists, then polls until it matches. The default source name is `recent`; matching treats it as unwrapped recent output from the latest 80 rendered terminal rows. `--lines` changes that row limit. `--match` finds a literal substring on one line, and `--regex` uses Rust regular-expression syntax and also matches one line at a time.

A timeout or `agent_prompt_stalled` does not prove the prompt was never delivered. Inspect the agent before retrying.

`pane wait-output` and `agent wait` wait indefinitely when `--timeout` is omitted. For `agent prompt --wait`, the settled-state wait is indefinite after activity is observed or when the prompt starts in `working`; a non-working prompt still returns `agent_prompt_stalled` after five seconds without observed activity. A timeout or server error is emitted as JSON on stderr with exit status 1. CLI usage errors exit with status 2.

## Integrations

```bash
herdr integration install pi
herdr integration install omp
herdr integration install claude
herdr integration install codex
herdr integration install copilot
herdr integration install devin
herdr integration install droid
herdr integration install kimi
herdr integration install opencode
herdr integration install kilo
herdr integration install hermes
herdr integration install qodercli
herdr integration install qwen
herdr integration install letta
herdr integration install cursor
herdr integration install mastracode
herdr integration install grok
herdr integration uninstall pi
herdr integration uninstall omp
herdr integration uninstall claude
herdr integration uninstall codex
herdr integration uninstall copilot
herdr integration uninstall devin
herdr integration uninstall droid
herdr integration uninstall kimi
herdr integration uninstall opencode
herdr integration uninstall kilo
herdr integration uninstall hermes
herdr integration uninstall qodercli
herdr integration uninstall qwen
herdr integration uninstall letta
herdr integration uninstall cursor
herdr integration uninstall mastracode
herdr integration uninstall grok
herdr integration status [--outdated-only]
```

## Plugins

Plugin commands install and run local executable workflow plugins. A plugin is a manifest plus out-of-process commands; Herdr owns the host surface and plugins own their implementation language.

Install, list, and remove plugins:

```bash
herdr plugin install <owner>/<repo>[/subdir...] [--ref REF] [--yes]
herdr plugin update [<plugin_id|owner/repo[/subdir...]>...] [--yes]
herdr plugin list [--plugin ID] [--json]
herdr plugin uninstall <plugin_id|owner/repo[/subdir...]>
herdr plugin enable <plugin_id>
herdr plugin disable <plugin_id>
```

`plugin install` accepts GitHub shorthand only, such as `ogulcancelik/herdr-plugin-examples/worktree-bootstrap`. It uses `git`, shows a trust preview in interactive terminals, runs supported manifest build commands, and stores GitHub installs in a Herdr-managed directory. Use `--yes` for noninteractive installs. `plugin update` refreshes every GitHub-managed plugin when no targets are given, or only the listed plugin ids or GitHub sources. It preserves each install's requested ref, skips unchanged commits and ignores locally linked plugins during bulk updates. Reinstalling a GitHub-managed plugin creates a new installation directory. Running plugins keep their original files; new invocations use the new installation. Installing over a locally linked plugin is refused. Plugin manifests must declare `min_herdr_version`; install and link fail when the plugin requires a newer Herdr binary. `plugin list` is human-readable by default; pass `--json` for the raw API response.

Plugin installation and enabled state are global to the current user. A plugin installed, linked, enabled, or disabled through one Herdr session is immediately available with the same state in every session.

Local development:

```bash
herdr plugin link <path> [--disabled]
herdr plugin unlink <plugin_id>
```

`plugin link` accepts a plugin directory containing `herdr-plugin.toml` or a direct manifest path. Use it while authoring or testing a plugin from a local checkout. `plugin unlink` and `plugin uninstall` unregister the plugin and leave files in place so running plugins can finish. Updates and reinstalls also retain previous installations; new invocations use the replacement without a config reload. A later successful installation/update or server startup removes obsolete managed installations after the servers using them have exited. Config reload does not release old installations. Plugins must stop detached background processes before their parent command or pane exits; processes surviving server exit are not protected from cleanup. Legacy installations without cleanup tracking and locally linked files are retained. For GitHub installs, uninstall accepts either the plugin id or the same `owner/repo[/subdir...]` shorthand used by install. Actions, event hooks, panes, and link handlers are declared in the manifest; runtime action registration is not part of v1.

Config directory:

```bash
herdr plugin config-dir <plugin_id>
```

`plugin config-dir` prints the plugin's config directory. It creates the directory if needed and seeds it from legacy plugin config locations when present. Use it in setup docs and shell scripts to point users at a stable path for `.env` files and other user-editable config, separate from the managed plugin checkout.

Actions:

```bash
herdr plugin action list [--plugin ID]
herdr plugin action invoke <action_id> [--plugin ID]
```

`plugin action invoke` starts the manifest command for an installed, enabled,
platform-compatible plugin action and prints the started command log record in
the JSON response. Use the qualified action id (`plugin.id.action`) when more
than one plugin uses the same action id. Local action ids cannot contain dots,
so qualified ids remain unambiguous even when plugin ids contain dots.

Logs:

```bash
herdr plugin log list [--plugin ID] [--limit N]
```

Managed terminal panes:

```bash
herdr plugin pane open --plugin ID --entrypoint ID [--placement overlay|popup|split|tab|zoomed] [--width SIZE] [--height SIZE] [--workspace ID] [--target-pane PANE] [--direction right|down] [--cwd PATH] [--env KEY=VALUE] [--focus|--no-focus]
herdr plugin pane focus <pane_id>
herdr plugin pane close <pane_id>
```

`plugin pane open` requires the plugin to be linked, enabled, and compatible
with the current platform. It starts a manifest-declared `[[panes]]` command as
a Herdr-managed terminal pane. The manifest default is `overlay`, which opens a
temporary zoomed overlay over the active pane. It can also open as a split, a
new tab, a zoomed pane, or a session-modal `popup` that does not change the tab
layout. `--width` and `--height` set the outer popup dimensions in terminal
cells or percentages such as `80%`; omitted dimensions default to half the
terminal size, and values smaller than the popup minimum are clamped. A popup
is not a Herdr pane, does not export `HERDR_PANE_ID`, and does not participate
in pane or agent APIs. Native non-terminal plugin panes are outside plugin v1.

New panes identify as `TERM_PROGRAM=herdr`, with `TERM_PROGRAM_VERSION` set to
Herdr's version. They keep `TERM=xterm-256color` and `COLORTERM=truecolor`.
They also get `fish_handle_reflow=0`, because Herdr reflows text on resize;
an inherited or explicit `fish_handle_reflow` value is kept.
Herdr removes inherited outer-terminal session markers (iTerm2, WezTerm, Kitty,
Windows Terminal, tmux, screen, and Zellij), iTerm2's `LC_TERMINAL` identity,
and known Claude Code, Codex, and OMP session markers before applying explicit
launch environment values. This prevents new panes from claiming the terminal
or agent session that originally started the server. Ordinary environment
variables, including API keys and display settings, remain inherited rather than
being replaced with the attaching client's environment. SSH-agent forwarding has
its own reconnect handling. Existing pane processes are unchanged by this cleanup.

`--env KEY=VALUE` can be repeated on process-launching commands. It applies to the newly launched process only. Herdr-managed variables such as `HERDR_SOCKET_PATH`, `HERDR_BIN_PATH`, `HERDR_ENV`, `HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`, `HERDR_PANE_ID`, `HERDR_PLUGIN_ID`, `HERDR_PLUGIN_ROOT`, `HERDR_PLUGIN_CONFIG_DIR`, `HERDR_PLUGIN_STATE_DIR`, `HERDR_PLUGIN_ENTRYPOINT_ID`, and `HERDR_PLUGIN_CONTEXT_JSON` stay authoritative when they conflict with caller-provided env.

## Read sources

| Source | Meaning |
| --- | --- |
| `visible` | Current rendered screen. Best for UI feedback loops. |
| `recent` | Recent scrollback with terminal wrapping. |
| `recent-unwrapped` | Recent scrollback without soft wrapping. Best for logs. |
| `detection` | Bottom-buffer snapshot used by agent screen detection. |

These meanings apply to reads. For `pane wait-output` only, both `recent` and `recent-unwrapped` search the unwrapped recent snapshot; `recent` remains the default spelling.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `HERDR_CONFIG_PATH` | Override the config file path. |
| `HERDR_SESSION` | Select a named session for CLI commands. |
| `HERDR_SOCKET_PATH` | Low-level socket path override. |
| `HERDR_PROCESS_DETECTION` | Linux process detection strategy: `native` (default) or opt-in `child-groups`. |
| `HERDR_ENV` | Set to `1` inside Herdr-managed pane processes. |
| `HERDR_PANE_ID` | Public pane id for the running pane process. |
| `HERDR_TAB_ID` | Public tab id for the running pane process. |
| `HERDR_WORKSPACE_ID` | Public workspace id for the running pane process. |
| `HERDR_LOG` | Set log filter, for example `HERDR_LOG=herdr=debug`. |
| `HERDR_DISABLE_SOUND` | Disable sound playback even when sound notifications are enabled. |

```

**Tool: webfetch**

**Input:**
```json
{
  "url": "https://raw.githubusercontent.com/herdrdev/herdr/v0.9.5/docs/next/website/src/content/docs/concepts.mdx",
  "format": "text"
}
```

**Output:**
```
---
title: Concepts
description: Understand Herdr workspaces, tabs, panes, agents, sessions, and modes.
---

Herdr is a terminal workspace manager. It keeps real terminal processes running and adds structure around them.

## Workspace

A workspace is the top-level project container. Use one workspace per repo, task, or investigation.

A workspace owns tabs and panes. Its sidebar state rolls up from the agents inside it, so you can see which project needs attention.

## Tab

A tab is a layout inside a workspace. Use tabs to separate views like `agents`, `logs`, `server`, or `review`.

Tabs are addressable from the CLI and socket API.

## Pane

A pane is a real terminal. Herdr renders the terminal output, sends input back to the process, and preserves the pane across client detach.

Panes can be split right or down. They can be renamed manually, read from the CLI, sent input, and closed.

## Mouse UI

Herdr is mouse-native. You can click panes, tabs, workspaces, and agents. You can drag split borders, select text, and use right-click menus. Everything below is also reachable by mouse; keyboard bindings are an optional layer.

If you prefer keyboard-only control, or you want Herdr to stop capturing mouse input, disable mouse capture:

```toml
[ui]
mouse_capture = false
```

## Agent

An agent is a process Herdr recognizes inside a pane. Herdr detects agents from foreground processes, screen manifests, and optional integrations.

Agent states are:

| State | Meaning |
| --- | --- |
| `blocked` | The agent needs input, approval, or a decision. |
| `working` | The agent is actively running. |
| `done` | The agent finished and you have not looked at it yet. |
| `idle` | The agent is finished or waiting and has been seen. |
| `unknown` | Herdr cannot confidently classify the state. |

Each client tracks which completions it has displayed. Viewing a completion in one client does not clear another client's Done badge. CLI/API statuses use the server's seen state, so they need not match a particular client's badge; both `idle` and `done` mean ready for input.

## Session

A session is a persistent Herdr server namespace. The default `herdr` command attaches to the default session.

Named sessions are separate runtime namespaces:

```bash
herdr session list
herdr session attach work
herdr session attach side-project
```

Use workspaces first. Use named sessions when you need completely separate panes, sockets, and persisted runtime state.

## Client and server

By default, Herdr runs as a background server plus one or more attached clients.

The server owns panes and process state. The client is the terminal UI attached to that server.

With one attached client, all tabs follow its size as before. With multiple clients, each can view its own workspace and tab. Different viewed tabs follow their respective clients; when clients view the same tab, the last one to focus, select, or interact with it controls that tab's pane sizes.

Detach the client with `ctrl+b q`. The server and agents continue running.

If you want to end the session and stop its panes, stop the server:

```bash
herdr server stop
```

## Modes

Herdr has terminal mode, prefix mode, and navigate mode.

Terminal mode sends keys to the focused pane. Prefix mode waits for one Herdr action after the prefix key. Navigate mode is the persistent workspace navigation surface.

Press the prefix key, default `ctrl+b`, then an action key such as `c` for a new tab or `w` for workspace navigation. See [Keyboard](/docs/keyboard/) if the prefix idea is new to you.

```

**Tool: webfetch**

**Input:**
```json
{
  "url": "https://raw.githubusercontent.com/herdrdev/herdr/v0.9.5/docs/next/website/src/content/docs/agent-automation.mdx",
  "format": "text"
}
```

**Output:**
```
---
title: Agent automation
description: Use Herdr's layout, pane, and agent primitives to coordinate coding agents from scripts or other agents.
---

Use Herdr as an automation layer for coding agents. A script can control them, or one agent can create work for other agents, inspect their state, and collect their results. Choose the primitive that matches the job.

## Three primitives

| Primitive | Responsibility |
| --- | --- |
| Layout (`workspace`, `tab`, and pane topology) | Create and organize terminal locations. |
| Pane | Control a raw terminal: run commands, send input, read output, and wait for output. |
| Agent | Control a recognized coding agent by name or pane and lifecycle state. |

A pane exists whether or not it contains an agent. An agent is the recognized process currently running inside a pane. `agent start` therefore requires an existing shell pane and never creates, splits, or moves layout.

Creating a workspace also creates its first tab and root pane; creating a tab creates its root pane. Use the returned pane ID for the first process, and split only when that layout needs another terminal.

Creation commands print JSON. Capture IDs from the response instead of predicting them:

```bash
created=$(herdr workspace create --cwd ~/project --label api --no-focus)
pane_id=$(printf '%s\n' "$created" | jq -r '.result.root_pane.pane_id')

split=$(herdr pane split "$pane_id" --direction right --no-focus)
review_pane=$(printf '%s\n' "$split" | jq -r '.result.pane.pane_id')
```

`workspace create` returns `.result.workspace`, `.result.tab`, and `.result.root_pane`. `tab create` returns `.result.tab` and `.result.root_pane`. `pane split` returns the new pane as `.result.pane`.

Moving a pane to another workspace changes its workspace-qualified pane ID. After any `pane move`, continue with `.result.move_result.pane.pane_id`; the response keeps the old value at `.result.move_result.previous_pane_id`. A running process keeps its launch-time Herdr environment, but the old `HERDR_PANE_ID` remains an alias for that terminal, so `--current` stays safe. New commands can still resolve the agent by name after the move, but a wait already in progress ends with `agent_not_running`.

Use pane commands for shells, tests, servers, CI watchers, and other ordinary terminal processes. Use agent commands when Herdr needs to understand which agent is running or whether it is `working`, `blocked`, `done`, `idle`, or `unknown`.

## Agent identity and launch

A pane ID such as `w1:p2` identifies the terminal location. An agent name such as `reviewer` is a convenient alias for the current agent in that pane. Names must match `[a-z][a-z0-9_-]{0,31}` and be unique among live agents. The alias is cleared when that agent exits, is released, or is replaced; it does not permanently rename the pane.

Agent commands accept either a unique live name or the pane ID that currently hosts the agent.

An available shell pane is at its interactive shell prompt: the shell itself owns the foreground, with no foreground command, editor, or agent running. Return the pane to its prompt before calling `agent start`.

`--kind` selects a supported agent and its canonical executable. Supported kinds are `pi`, `claude`, `codex`, `gemini`, `cursor`, `devin`, `agy`, `cline`, `omp`, `mastracode`, `opencode`, `copilot`, `kimi`, `kiro`, `droid`, `amp`, `grok`, `hermes`, `kilo`, `qodercli`, `qwen`, `letta`, `maki`, and `muse`. Arguments after `--` are passed unchanged to that executable.

Successful `agent start` returns only after Herdr detects the expected agent in the same terminal and marks it ready for interactive input. If detection reports `blocked` during startup, the command returns `agent_not_ready` immediately. The name remains available for `agent read` and `agent send-keys`, and becomes ready for prompts after detection reports `idle`. Startup waits for 30 seconds by default; `--timeout` must be greater than 3000 and no more than 300000 milliseconds.

```bash
herdr agent start reviewer --kind codex --pane "$review_pane" -- -m gpt-5.4
```

Agents launched manually are detected automatically and can be addressed by pane ID. Give one a name when a stable human-readable target is useful:

```bash
herdr agent get w1:p2
herdr agent rename w1:p2 reviewer
```

## Choose the control surface

| Goal | Command |
| --- | --- |
| Run a shell command and submit it | `pane run` |
| Send literal text without Enter | `pane send-text` |
| Send terminal keys or modifier chords | `pane send-keys` |
| Wait for text or a regular expression | `pane wait-output` |
| Start a supported agent in an existing pane | `agent start` |
| Submit a prompt, optionally waiting for it | `agent prompt` |
| Send keys to an agent's interactive UI | `agent send-keys` |
| Wait for agent lifecycle state | `agent wait` |

`agent prompt` submits text plus encoded Enter and honors the terminal's live bracketed-paste mode. It can prompt an agent that is already working. If the agent is already `blocked`, it returns `agent_blocked` without sending terminal input; inspect the dialog and use `agent send-keys` for a deliberate response. Use `agent send-keys` for interactions such as `esc`, `up`, `enter`, or `ctrl+c`; `escape` is accepted as an alias for `esc`. Use the pane input commands when you deliberately want raw terminal control.

Pane input addresses the terminal regardless of its current occupant. Agent input resolves the live agent and rejects the operation if that agent no longer controls the pane.

`agent prompt --wait` rejects an agent already `blocked` with `agent_blocked`, without sending input or starting a wait. Otherwise, it writes the prompt and delayed Enter as one ordered submission before waiting. On Windows, Codex receives a paste boundary before Enter so submission does not depend on prompt size. The caller timeout includes submission time. If the prompt started from another non-working state, Herdr waits up to five seconds after submission to observe `working` or `blocked`. Otherwise, it returns `agent_prompt_stalled`; if the caller timeout expires first, it returns the normal `timeout` error. This prevents unrelated `idle`, `done`, or session changes from completing the wait. After Herdr observes activity, it waits for the requested settled status. It does not track individual turns. If the agent is already working, completion of that active turn may satisfy the wait. Standalone `agent wait` observes the current agent and returns immediately if its status already matches. Both commands default to `idle`, `done`, or `blocked`. Repeat `--until` to accept several exact states, for example `--until idle --until done`; use `--until unknown` explicitly when needed. On `agent prompt`, `--until` requires `--wait`.

`idle` and `done` both mean the agent is ready for input. The CLI/API uses the server's seen state: `done` is idle but not yet marked seen, explicit `pane focus` / `agent focus` commands mark the target seen, and reads do not. Each TUI client tracks viewed completions independently, so a client's Done badge can differ from the CLI or another client's badge. `blocked` means Herdr recognized an approval or question UI. `unknown` means an agent is present but Herdr cannot classify its lifecycle confidently; it does not prove successful completion. Use exact `--until` states when that distinction matters.

Startup readiness, restoring an idle conversation, and switching agent conversations do not count as completed work. An agent that starts working immediately can finish its first task without Herdr first seeing an idle prompt. Agent responses may include `completion_seq`, identifying the current idle transition as completed work independently of who has viewed it. It matches that transition's `state_change_seq`; startup and session changes do not set it. Older servers may omit this field. Clients connected to older servers use observed working states to guard Done badges, so they may miss a turn that starts and finishes between updates.

A timeout or `agent_prompt_stalled` does not prove that no input was sent. Read the agent before retrying to avoid submitting the same prompt twice. IDs and agent names are scoped to one server; selecting another machine in the TUI does not retarget CLI commands running in an existing pane.

`pane wait-output` does not interpret agent lifecycle. It polls the selected terminal snapshot and searches it immediately, so text that was already present can match. The default source name is `recent`; matching treats that source as unwrapped recent output from the latest 80 rendered terminal rows. `--lines` changes that row limit, and `--regex` uses Rust regular-expression syntax and matches one line at a time.

At the CLI, both `pane read` and `agent read` print terminal text directly. The default is UTF-8 text with ANSI escapes stripped; use `--format ansi` or `--ansi` to preserve terminal escapes where the source exposes them. The `detection` source is always plain text. For recent sources, `--lines N` selects the last N rendered terminal rows before optional unwrapping; without it, reads default to 80 rows. For `visible` and `detection`, omitting `--lines` returns the full snapshot, while specifying it keeps the last N newline-delimited lines. The socket API returns the text at `.result.read.text`.

## Alternate-screen history reads

Full-screen agents such as Claude Code and OpenCode render transcript history in the terminal's alternate screen instead of Herdr's host scrollback. For an idle, recognized agent at the bottom of its transcript, text reads from `recent` or `recent-unwrapped` automatically use the agent's mouse-scroll interface when `--lines` requests more than the visible screen. Herdr collects overlapping pages and returns the viewport to the bottom before completing the read. The same behavior applies to `pane read` when the pane contains that agent; it requires no additional option.

Other reads remain passive. Herdr does not move the application viewport for `visible`, `detection`, or ANSI reads, output waits and subscriptions, a manually scrolled agent, a direct attachment, or an application that does not report mouse-wheel input. An explicit `agent read --lines N` that needs alternate-screen history returns `agent_not_idle` while the agent is working, blocked, or unknown; wait for idle and retry, or use `--source visible`. Other recent reads return the available screen and host scrollback as before.

If a full response is still unavailable, ask the agent to write it as Markdown in a temporary directory and reply only with the file path, then read the file directly.

Successful `agent start`, `agent prompt`, and `agent wait` commands return the current agent at `.result.agent`. `pane wait-output` returns `.result.pane_id`, `.result.matched_line`, and the matched snapshot at `.result.read`.

Wait commands have no default timeout and can wait indefinitely. On timeout or another server error, CLI commands print a JSON error to stderr and exit with status 1; invalid CLI syntax exits with status 2.

## Recipes

Start a helper, give it work, and wait for that work to settle:

```bash
split=$(herdr pane split --current --direction right --no-focus)
review_pane=$(printf '%s\n' "$split" | jq -r '.result.pane.pane_id')
herdr agent start reviewer --kind codex --pane "$review_pane" -- -m gpt-5.4
herdr agent prompt reviewer "Review the current diff" --wait --timeout 120000
herdr agent read reviewer --source recent-unwrapped --lines 120
```

Wait for an agent to ask for input, inspect it, and interact with its UI:

```bash
herdr agent wait reviewer --until blocked --timeout 120000
herdr agent read reviewer --source recent-unwrapped --lines 80
herdr agent send-keys reviewer esc
```

Run an ordinary process and wait for its output without treating it as an agent:

```bash
herdr pane run w1:p3 "just test --watch"
herdr pane wait-output w1:p3 --regex "passed|failed" --timeout 120000
```

See the [CLI reference](/docs/cli-reference/) for the complete command and option list. Shell completions expose the same command tree interactively.

```

**Tool: webfetch**

**Input:**
```json
{
  "url": "https://raw.githubusercontent.com/herdrdev/herdr/v0.9.5/docs/next/website/src/content/docs/session-state.mdx",
  "format": "text"
}
```

**Output:**
```
---
title: Session state and restore
description: Understand what Herdr keeps live, restores after restart, replays from history, resumes through agent integrations, and hands off during updates.
---

Herdr uses several state paths for different situations.

## What survives

| Case | Processes keep running | Layout returns | Recent screen returns | Agent conversation resumes |
| --- | --- | --- | --- | --- |
| Detach and reattach | Yes | Yes | Yes, from the live terminal | Yes, because the process never stopped |
| Server restart | No | Yes | Only with pane screen history | Only with native agent session restore |
| Update without `--handoff` | Compatible servers keep running; restart-required servers may need stop/restart | Yes after restart | Only with pane screen history | Only with native agent session restore |
| Update with `--handoff` | Best effort for supported running servers | Yes | Yes, from the live terminal if handoff succeeds | Yes, because the process keeps running if handoff succeeds |

## Live persistence

Normal detach keeps the Herdr server running. Panes, shells, agents, servers, tests, and command processes keep running inside that server.

Detach the client with `ctrl+b q`. Reattach later:

```bash
herdr
```

This is the strongest persistence path because the original processes never stop.

## Snapshot restore

If the Herdr server stops and starts again, the original pane processes are gone. Herdr restores the saved session shape: workspaces, tabs, panes, cwd, layout, and focus.

Snapshot restore does not preserve running shells, servers, tests, or arbitrary processes. Panes that cannot use a stronger restore path come back as new shells in their saved directories.

If a saved directory is unavailable or the shell cannot start, the pane stays in the layout with an error instead of disappearing or moving to your home directory. Its saved directory and agent session reference remain intact. Fix the directory or shell configuration and restart the server to retry, or explicitly close the pane to remove it.

When saving, Herdr prefers the live shell's directory where the operating system exposes it, and retains the last confirmed directory after the shell exits. Shell-reported directories remain the fallback on other platforms.

If `session.json` cannot be read or parsed, or requires a newer Herdr version, Herdr logs why loading failed. Before saving or clearing the replacement session, it preserves the original bytes in `session-backups/` beside `session.json` and logs the recovery path as `persist.backup`. A file missing at startup is checked again before the first save or clear. These failed-load recovery copies are separate from normal snapshot history.

Herdr retains the three most recent recovery copies, pruning older copies only after a new copy is safely written. If preservation fails, autosave and shutdown leave the original untouched and log the failure; preservation is retried on the next save request. Copies are never restored automatically. To recover one, stop the affected server, copy the recovery file over its `session.json`, then restart. Recovery copies do not include pane screen history.

## Shutdown and snapshot recovery

On Linux systems with systemd-logind, Herdr listens for the host shutdown warning and requests a short delay while it saves and stops. This happens before logind proceeds with shutdown. The operating system limits the delay; Herdr does not block shutdown indefinitely. This protection is unavailable without logind and does not cover forced shutdown, power loss, or processes killed before the warning arrives.

Herdr also keeps up to 48 layout snapshots in `session-snapshots/` beside `session.json`, on all platforms. The first saved layout is copied immediately. Later saves or clears can add a snapshot of the previous saved layout, at most once every 15 minutes. Unchanged snapshots are not duplicated. The interval survives server restarts, so a burst of pane exits or restarts cannot rotate away all older layouts. Recent changes may not be in the recovery snapshots.

Normal pane closures still update `session.json`. There are no recovery prompts and no automatic restoration of older snapshots. To recover a layout:

1. Find the affected session directory with `herdr session list --json`.
2. Stop that server (`herdr server stop` for the default session, or `herdr session stop <name>` for a named session).
3. Keep a copy of its current `session.json`, then copy the chosen file from `session-snapshots/` over `session.json`. File modification times identify when snapshots were taken.
4. Start the session again.

Snapshots contain layout and agent session references, not running processes or pane screen history. Treat them as private session data. A snapshot-write failure is logged but does not prevent the primary session from saving.

## Pane screen history replay

Pane screen history restores recent terminal contents after a full server restart without restoring the old process.

Pane screen history is off by default because pane output can include secrets, tokens, prompts, and command output. Enable it in the config file:

```toml
[experimental]
pane_history = true
```

When enabled, Herdr stores saved pane history in `session-history.json` next to `session.json`. Treat the Herdr config/session directory like terminal history.

History is replayed only when it matches the exact saved layout. History from a different layout, including after manual snapshot recovery, is ignored. Older history files without layout verification are also ignored; newly saved history can be replayed on the next restart.

## Native agent session restore

Some agents can resume their own conversation sessions. Herdr can use official integration-reported session references to restart supported agent panes after a Herdr server restart.

Native agent session restore is enabled by default. Disable it with:

```toml
[session]
resume_agents_on_restore = false
```

Herdr resumes panes that reported a native session reference through a current official Herdr integration, and panes whose agent reported its own resume command. See [Add Herdr support to your agent](/docs/add-herdr-support/).

After a client attaches and provides terminal size and theme context, Herdr resumes eligible restored agent panes across workspaces and tabs without waiting for each pane to be focused.

Native session restore requires these Herdr integration versions or newer:

| Agent | Minimum Herdr integration version | Resume command |
| --- | --- | --- |
| Pi | `2` | `pi --session <path-or-id>` |
| Antigravity CLI | `1` | `agy --conversation <id>` |
| OMP | `3` | `omp --resume=<path-or-id>` |
| Claude Code | `6` | `claude --resume <id>` |
| Codex | `5` | `codex resume <id>` |
| Cursor Agent CLI | `1` | `cursor-agent --resume <id>` |
| Grok CLI | `2` | `grok --resume <id>` |
| GitHub Copilot CLI | `2` | `copilot --resume=<id>` |
| Devin CLI | `2` | `devin --resume <id>` |
| Droid | `2` | `droid --resume <id>` |
| Kimi Code CLI | `3` | `kimi --session <id>` |
| Qoder CLI | `2` | `qodercli --resume <id>` |
| Qwen Code | `1` | `qwen --resume <id>` |
| Letta Code | `1` | `letta --conversation <id>` or `letta --conversation default --agent <agent-id>` for `default:<agent-id>` |
| OpenCode | `5` | `opencode --session <id>` |
| Kilo Code CLI | `1` | `kilo --session <id>` |
| Hermes Agent | `2` | `hermes --resume <id>` |
| MastraCode | `1` | `mastracode --thread <id>` |

Run `herdr integration status` to check installed integration versions. Reinstall outdated integrations with `herdr integration install <agent>`.

Unsupported, missing, invalid, duplicated, or stale session references restore as normal shells in the saved pane directory.

If native agent session restore applies to a pane, Herdr resumes the agent session instead of replaying saved pane history for that pane.

## Live handoff

Live handoff is for update and remote attach flows that need to replace a running Herdr server. It asks the old server to transfer live panes to the new server, so pane processes can keep running across the server replacement.

Unlike snapshot restore, pane history replay, and native agent session restore, handoff tries to keep the current processes alive rather than reconstructing state after the old server stops.

A successful handoff preserves long-lived server-owned session state: pane PTYs and processes, agent identity and durable metadata, and plugin/session state needed by the replacement server. It does not preserve transient coordination across the replacement boundary. In-flight CLI or API requests, waits, subscription streams, client sockets, and pane-to-pane messages may be interrupted; clients should reconnect and retry them.

Updated Unix servers can send more than 64 panes in one handoff by transferring them in batches. The sending server must already contain this support: an older running server still enforces its 64-pane limit on the first upgrade. That limit may require a normal server restart, which ends pane processes. Batching does not change update installation order or remove other handoff compatibility requirements.

Live handoff is experimental and opt-in:

```bash
herdr update --handoff
herdr --remote workbox --handoff
```

Plain `herdr update` installs the new client and keeps endpoint-generation-1 servers running. Plain `herdr --remote workbox` also keeps a compatible remote server running across version differences. A stop is required only for the one-time upgrade from a pre-generation-1 server; use `--handoff` when you explicitly want to replace a supported running server without losing its pane processes.

`herdr update --handoff` only applies to installs managed by Herdr's own updater. Homebrew, mise, and Nix installs are updated through their package managers, so `herdr update` is disabled there and cannot perform live handoff.

```

**Tool: webfetch**

**Input:**
```json
{
  "url": "https://raw.githubusercontent.com/herdrdev/herdr/v0.9.5/docs/next/website/src/data/config-reference.json",
  "format": "text"
}
```

**Output:**
```
{
  "sections": [
    {
      "id": "general",
      "title": "General",
      "keys": [
        {
          "key": "onboarding",
          "type": "boolean",
          "default": "unset",
          "description": "Show first-run setup on startup. Missing or true shows onboarding; continuing from onboarding writes onboarding = false."
        }
      ]
    },
    {
      "id": "server",
      "title": "Server",
      "keys": [
        {
          "key": "server.allow_unelevated_clients",
          "type": "boolean",
          "default": "false",
          "description": "Windows only: allow ordinary clients from the same account to control an elevated server and its administrator panes. Applies at server startup and requires a restart; config reload does not change access. The --allow-unelevated-clients startup flag enables sharing even when this setting is false."
        },
        {
          "key": "server.headless_cols",
          "type": "integer",
          "default": "120",
          "description": "Virtual terminal width used for layout and newly created panes when no client is attached. Must be greater than zero."
        },
        {
          "key": "server.headless_rows",
          "type": "integer",
          "default": "40",
          "description": "Virtual terminal height used for layout and newly created panes when no client is attached. Must be greater than zero."
        }
      ]
    },
    {
      "id": "theme",
      "title": "Theme",
      "keys": [
        {
          "key": "theme.name",
          "type": "string",
          "default": "\"catppuccin\"",
          "description": "Built-in theme name."
        },
        {
          "key": "theme.auto_switch",
          "type": "boolean",
          "default": "false",
          "description": "Follow host terminal light/dark appearance and switch between theme names."
        },
        {
          "key": "theme.dark_name",
          "type": "string",
          "default": "unset",
          "description": "Theme name used when `auto_switch` selects a dark appearance."
        },
        {
          "key": "theme.light_name",
          "type": "string",
          "default": "unset",
          "description": "Theme name used when `auto_switch` selects a light appearance."
        },
        {
          "key": "theme.custom.accent",
          "type": "color",
          "default": "unset",
          "description": "Override the accent color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.panel_bg",
          "type": "color",
          "default": "unset",
          "description": "Override the panel_bg color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.sidebar_bg",
          "type": "color",
          "default": "unset",
          "description": "Set the desktop sidebar background without changing other panel surfaces. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.active_row_bg",
          "type": "color",
          "default": "unset",
          "description": "Set the active Space and focused Agent row background without changing separators or scrollbar tracks. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.selection_bg",
          "type": "color",
          "default": "unset",
          "description": "Set the Navigate-mode cursor row background in the sidebar without changing other selection surfaces. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.surface0",
          "type": "color",
          "default": "unset",
          "description": "Override the surface0 color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.surface1",
          "type": "color",
          "default": "unset",
          "description": "Override the surface1 color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.surface_dim",
          "type": "color",
          "default": "unset",
          "description": "Override the surface_dim color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.overlay0",
          "type": "color",
          "default": "unset",
          "description": "Override the overlay0 color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.overlay1",
          "type": "color",
          "default": "unset",
          "description": "Override the overlay1 color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.text",
          "type": "color",
          "default": "unset",
          "description": "Override the text color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.subtext0",
          "type": "color",
          "default": "unset",
          "description": "Override the subtext0 color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.mauve",
          "type": "color",
          "default": "unset",
          "description": "Override the mauve color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.green",
          "type": "color",
          "default": "unset",
          "description": "Override the green color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.yellow",
          "type": "color",
          "default": "unset",
          "description": "Override the yellow color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.red",
          "type": "color",
          "default": "unset",
          "description": "Override the red color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.blue",
          "type": "color",
          "default": "unset",
          "description": "Override the blue color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.teal",
          "type": "color",
          "default": "unset",
          "description": "Override the teal color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.peach",
          "type": "color",
          "default": "unset",
          "description": "Override the peach color token on top of the base theme. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.accent",
          "type": "color",
          "default": "unset",
          "description": "Override the accent color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.panel_bg",
          "type": "color",
          "default": "unset",
          "description": "Override the panel_bg color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.sidebar_bg",
          "type": "color",
          "default": "unset",
          "description": "Override the sidebar_bg color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.active_row_bg",
          "type": "color",
          "default": "unset",
          "description": "Override the active_row_bg color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.selection_bg",
          "type": "color",
          "default": "unset",
          "description": "Override the selection_bg color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.surface0",
          "type": "color",
          "default": "unset",
          "description": "Override the surface0 color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.surface1",
          "type": "color",
          "default": "unset",
          "description": "Override the surface1 color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.surface_dim",
          "type": "color",
          "default": "unset",
          "description": "Override the surface_dim color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.overlay0",
          "type": "color",
          "default": "unset",
          "description": "Override the overlay0 color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.overlay1",
          "type": "color",
          "default": "unset",
          "description": "Override the overlay1 color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.text",
          "type": "color",
          "default": "unset",
          "description": "Override the text color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.subtext0",
          "type": "color",
          "default": "unset",
          "description": "Override the subtext0 color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.mauve",
          "type": "color",
          "default": "unset",
          "description": "Override the mauve color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.green",
          "type": "color",
          "default": "unset",
          "description": "Override the green color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.yellow",
          "type": "color",
          "default": "unset",
          "description": "Override the yellow color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.red",
          "type": "color",
          "default": "unset",
          "description": "Override the red color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.blue",
          "type": "color",
          "default": "unset",
          "description": "Override the blue color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.teal",
          "type": "color",
          "default": "unset",
          "description": "Override the teal color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.light.peach",
          "type": "color",
          "default": "unset",
          "description": "Override the peach color token when auto_switch selects a light appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.accent",
          "type": "color",
          "default": "unset",
          "description": "Override the accent color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.panel_bg",
          "type": "color",
          "default": "unset",
          "description": "Override the panel_bg color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.sidebar_bg",
          "type": "color",
          "default": "unset",
          "description": "Override the sidebar_bg color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.active_row_bg",
          "type": "color",
          "default": "unset",
          "description": "Override the active_row_bg color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.selection_bg",
          "type": "color",
          "default": "unset",
          "description": "Override the selection_bg color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.surface0",
          "type": "color",
          "default": "unset",
          "description": "Override the surface0 color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.surface1",
          "type": "color",
          "default": "unset",
          "description": "Override the surface1 color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.surface_dim",
          "type": "color",
          "default": "unset",
          "description": "Override the surface_dim color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.overlay0",
          "type": "color",
          "default": "unset",
          "description": "Override the overlay0 color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.overlay1",
          "type": "color",
          "default": "unset",
          "description": "Override the overlay1 color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.text",
          "type": "color",
          "default": "unset",
          "description": "Override the text color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.subtext0",
          "type": "color",
          "default": "unset",
          "description": "Override the subtext0 color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.mauve",
          "type": "color",
          "default": "unset",
          "description": "Override the mauve color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.green",
          "type": "color",
          "default": "unset",
          "description": "Override the green color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.yellow",
          "type": "color",
          "default": "unset",
          "description": "Override the yellow color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.red",
          "type": "color",
          "default": "unset",
          "description": "Override the red color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.blue",
          "type": "color",
          "default": "unset",
          "description": "Override the blue color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.teal",
          "type": "color",
          "default": "unset",
          "description": "Override the teal color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        },
        {
          "key": "theme.custom.dark.peach",
          "type": "color",
          "default": "unset",
          "description": "Override the peach color token when auto_switch selects a dark appearance. Applied after theme.custom. Accepts hex, named colors, rgb(r,g,b), or reset aliases."
        }
      ]
    },
    {
      "id": "terminal",
      "title": "Terminal",
      "keys": [
        {
          "key": "terminal.default_shell",
          "type": "string",
          "default": "\"\"",
          "description": "Executable used for new interactive panes. Empty means SHELL, then /bin/sh; on Windows, pwsh.exe when present on PATH, otherwise powershell.exe."
        },
        {
          "key": "terminal.shell_mode",
          "type": "enum",
          "default": "\"auto\"",
          "description": "Startup mode for new interactive pane shells.",
          "values": [
            "auto",
            "login",
            "non_login"
          ]
        },
        {
          "key": "terminal.new_cwd",
          "type": "enum",
          "default": "\"follow\"",
          "description": "CWD policy for new interactive panes, tabs, and workspaces.",
          "values": [
            "follow",
            "home",
            "current",
            "path"
          ]
        },
        {
          "key": "terminal.kitty_graphics",
          "type": "boolean",
          "default": "true",
          "description": "Render pane images in Kitty graphics-compatible outer terminals. Applications use the standard Kitty graphics protocol through pane terminal output; the external socket pane-overlay API is no longer available. Set false to disable graphics rendering. Restart the server or reattach the client after changing it. In remote sessions, server configuration controls Kitty graphics parsing while local client configuration controls outer-terminal output."
        }
      ]
    },
    {
      "id": "update",
      "title": "Updates",
      "keys": [
        {
          "key": "update.channel",
          "type": "enum",
          "default": "\"stable\" (\"preview\" for Windows preview builds)",
          "description": "Update channel used by background version checks and herdr update. Stable Windows builds default to stable; existing Windows preview installs stay on preview until explicitly switched. Homebrew, mise, and Nix installs ignore the preview channel.",
          "values": [
            "stable",
            "preview"
          ]
        },
        {
          "key": "update.version_check",
          "type": "boolean",
          "default": "true",
          "description": "Check herdr.dev for new Herdr versions in the background."
        },
        {
          "key": "update.manifest_check",
          "type": "boolean",
          "default": "true",
          "description": "Check herdr.dev for remote agent-detection manifest updates in the background. Bundled manifests and local overrides still apply."
        }
      ]
    },
    {
      "id": "keys",
      "title": "Keybindings",
      "keys": [
        {
          "key": "keys.prefix",
          "type": "keybinding",
          "default": "\"ctrl+b\"",
          "description": "Prefix key(s) to enter prefix mode (e.g. \"ctrl+b\", \"f12\", \"esc\", or an array to accept several)."
        },
        {
          "key": "keys.help",
          "type": "keybinding",
          "default": "\"prefix+?\"",
          "description": "Open keybinding help."
        },
        {
          "key": "keys.settings",
          "type": "keybinding",
          "default": "\"prefix+s\"",
          "description": "Open settings."
        },
        {
          "key": "keys.new_workspace",
          "type": "keybinding",
          "default": "\"prefix+shift+n\"",
          "description": "Create a new workspace."
        },
        {
          "key": "keys.new_worktree",
          "type": "keybinding",
          "default": "\"prefix+shift+g\"",
          "description": "Create a Git worktree from the selected workspace."
        },
        {
          "key": "keys.open_worktree",
          "type": "keybinding",
          "default": "unset",
          "description": "Open an existing Git worktree from the selected workspace. Unset by default."
        },
        {
          "key": "keys.remove_worktree",
          "type": "keybinding",
          "default": "unset",
          "description": "Delete the selected managed worktree checkout after confirmation. Unset by default."
        },
        {
          "key": "keys.rename_workspace",
          "type": "keybinding",
          "default": "\"prefix+shift+w\"",
          "description": "Rename the selected workspace."
        },
        {
          "key": "keys.close_workspace",
          "type": "keybinding",
          "default": "\"prefix+shift+d\"",
          "description": "Close the selected workspace."
        },
        {
          "key": "keys.workspace_picker",
          "type": "keybinding",
          "default": "\"prefix+w\"",
          "description": "Open the workspace navigation surface."
        },
        {
          "key": "keys.goto",
          "type": "keybinding",
          "default": "\"prefix+g\"",
          "description": "Open the session navigator."
        },
        {
          "key": "keys.navigate_workspace_up",
          "type": "keybinding",
          "default": "\"up\"",
          "description": "Move workspace selection up in navigate mode."
        },
        {
          "key": "keys.navigate_workspace_down",
          "type": "keybinding",
          "default": "\"down\"",
          "description": "Move workspace selection down in navigate mode."
        },
        {
          "key": "keys.navigate_pane_left",
          "type": "keybinding",
          "default": "\"h\"",
          "description": "Focus the pane to the left in navigate mode. Left arrow is always an alias."
        },
        {
          "key": "keys.navigate_pane_down",
          "type": "keybinding",
          "default": "\"j\"",
          "description": "Focus the pane below in navigate mode."
        },
        {
          "key": "keys.navigate_pane_up",
          "type": "keybinding",
          "default": "\"k\"",
          "description": "Focus the pane above in navigate mode."
        },
        {
          "key": "keys.navigate_pane_right",
          "type": "keybinding",
          "default": "\"l\"",
          "description": "Focus the pane to the right in navigate mode. Right arrow is always an alias."
        },
        {
          "key": "keys.detach",
          "type": "keybinding",
          "default": "\"prefix+q\"",
          "description": "Detach the current client from its Herdr server."
        },
        {
          "key": "keys.reload_config",
          "type": "keybinding",
          "default": "\"prefix+shift+r\"",
          "description": "Reload config.toml in the running app/server."
        },
        {
          "key": "keys.open_notification_target",
          "type": "keybinding",
          "default": "\"prefix+o\"",
          "description": "Focus the currently visible notification target."
        },
        {
          "key": "keys.previous_workspace",
          "type": "keybinding",
          "default": "unset",
          "description": "Select the previous workspace. Unset by default."
        },
        {
          "key": "keys.next_workspace",
          "type": "keybinding",
          "default": "unset",
          "description": "Select the next workspace. Unset by default."
        },
        {
          "key": "keys.previous_agent",
          "type": "keybinding",
          "default": "unset",
          "description": "Focus the previous agent shown in the agent panel. Unset by default."
        },
        {
          "key": "keys.next_agent",
          "type": "keybinding",
          "default": "unset",
          "description": "Focus the next agent shown in the agent panel. Unset by default."
        },
        {
          "key": "keys.focus_agent",
          "type": "keybinding",
          "default": "unset",
          "description": "Focus an agent by index 1-9. Unset by default."
        },
        {
          "key": "keys.remote_image_paste",
          "type": "string",
          "default": "\"ctrl+v\"",
          "description": "Local-client shortcut that sends a clipboard image to a remote Herdr session."
        },
        {
          "key": "keys.new_tab",
          "type": "keybinding",
          "default": "\"prefix+c\"",
          "description": "Create a new tab in the active workspace."
        },
        {
          "key": "keys.rename_tab",
          "type": "keybinding",
          "default": "\"prefix+shift+t\"",
          "description": "Rename the active tab."
        },
        {
          "key": "keys.previous_tab",
          "type": "keybinding",
          "default": "\"prefix+p\"",
          "description": "Select the previous tab."
        },
        {
          "key": "keys.next_tab",
          "type": "keybinding",
          "default": "\"prefix+n\"",
          "description": "Select the next tab."
        },
        {
          "key": "keys.move_tab_previous",
          "type": "keybinding",
          "default": "unset",
          "description": "Move the active tab one position toward the front. Unset by default."
        },
        {
          "key": "keys.move_tab_next",
          "type": "keybinding",
          "default": "unset",
          "description": "Move the active tab one position toward the back. Unset by default."
        },
        {
          "key": "keys.switch_tab",
          "type": "keybinding",
          "default": "\"prefix+1..9\"",
          "description": "Switch to tab 1-9."
        },
        {
          "key": "keys.switch_workspace",
          "type": "keybinding",
          "default": "unset",
          "description": "Switch to workspace 1-9 from prefix mode. Unset by default."
        },
        {
          "key": "keys.close_tab",
          "type": "keybinding",
          "default": "\"prefix+shift+x\"",
          "description": "Close the active tab."
        },
        {
          "key": "keys.rename_pane",
          "type": "keybinding",
          "default": "\"prefix+shift+p\"",
          "description": "Rename the focused pane."
        },
        {
          "key": "keys.edit_scrollback",
          "type": "keybinding",
          "default": "\"prefix+e\"",
          "description": "Open the focused pane scrollback in $EDITOR."
        },
        {
          "key": "keys.clear_pane",
          "type": "keybinding",
          "default": "unset",
          "description": "Clear the focused pane screen and scrollback, keeping the current cursor line and its visible soft-wrapped rows. Sends no input to the running program and does nothing on the alternate screen (for example, Vim). Unset by default; for example, clear_pane = \"prefix+ctrl+k\"."
        },
        {
          "key": "keys.copy_mode",
          "type": "keybinding",
          "default": "\"prefix+[\"",
          "description": "Enter keyboard copy mode for the focused pane."
        },
        {
          "key": "keys.focus_pane_left",
          "type": "keybinding",
          "default": "\"prefix+h\"",
          "description": "Focus the pane to the left."
        },
        {
          "key": "keys.focus_pane_down",
          "type": "keybinding",
          "default": "\"prefix+j\"",
          "description": "Focus the pane below."
        },
        {
          "key": "keys.focus_pane_up",
          "type": "keybinding",
          "default": "\"prefix+k\"",
          "description": "Focus the pane above."
        },
        {
          "key": "keys.focus_pane_right",
          "type": "keybinding",
          "default": "\"prefix+l\"",
          "description": "Focus the pane to the right."
        },
        {
          "key": "keys.swap_pane_left",
          "type": "keybinding",
          "default": "\"prefix+shift+h\"",
          "description": "Swap the focused pane with the pane to the left."
        },
        {
          "key": "keys.swap_pane_down",
          "type": "keybinding",
          "default": "\"prefix+shift+j\"",
          "description": "Swap the focused pane with the pane below."
        },
        {
          "key": "keys.swap_pane_up",
          "type": "keybinding",
          "default": "\"prefix+shift+k\"",
          "description": "Swap the focused pane with the pane above."
        },
        {
          "key": "keys.swap_pane_right",
          "type": "keybinding",
          "default": "\"prefix+shift+l\"",
          "description": "Swap the focused pane with the pane to the right."
        },
        {
          "key": "keys.cycle_pane_next",
          "type": "keybinding",
          "default": "\"prefix+tab\"",
          "description": "Cycle to the next pane."
        },
        {
          "key": "keys.cycle_pane_previous",
          "type": "keybinding",
          "default": "\"prefix+shift+tab\"",
          "description": "Cycle to the previous pane."
        },
        {
          "key": "keys.last_pane",
          "type": "keybinding",
          "default": "unset",
          "description": "Focus the last focused pane across workspaces and tabs. Unset by default."
        },
        {
          "key": "keys.split_vertical",
          "type": "keybinding",
          "default": "\"prefix+v\"",
          "description": "Split pane vertically (side by side)."
        },
        {
          "key": "keys.split_horizontal",
          "type": "keybinding",
          "default": "\"prefix+minus\"",
          "description": "Split pane horizontally (stacked)."
        },
        {
          "key": "keys.close_pane",
          "type": "keybinding",
          "default": "\"prefix+x\"",
          "description": "Close the focused pane."
        },
        {
          "key": "keys.zoom",
          "type": "keybinding",
          "default": "\"prefix+z\"",
          "description": "Toggle zoom for the focused pane. The legacy key name `fullscreen` is accepted as an alias."
        },
        {
          "key": "keys.resize_mode",
          "type": "keybinding",
          "default": "\"prefix+r\"",
          "description": "Enter resize mode."
        },
        {
          "key": "keys.resize_pane_left",
          "type": "keybinding",
          "default": "unset",
          "description": "Resize the focused pane toward the left. Unset by default."
        },
        {
          "key": "keys.resize_pane_down",
          "type": "keybinding",
          "default": "unset",
          "description": "Resize the focused pane downward. Unset by default."
        },
        {
          "key": "keys.resize_pane_up",
          "type": "keybinding",
          "default": "unset",
          "description": "Resize the focused pane upward. Unset by default."
        },
        {
          "key": "keys.resize_pane_right",
          "type": "keybinding",
          "default": "unset",
          "description": "Resize the focused pane toward the right. Unset by default."
        },
        {
          "key": "keys.toggle_sidebar",
          "type": "keybinding",
          "default": "\"prefix+b\"",
          "description": "Toggle sidebar collapse."
        },
        {
          "key": "keys.indexed.tabs",
          "type": "string",
          "default": "unset",
          "description": "Modifier combo for tab shortcuts 1-9. Unset by default."
        },
        {
          "key": "keys.indexed.workspaces",
          "type": "string",
          "default": "unset",
          "description": "Modifier combo for workspace shortcuts 1-9. Unset by default."
        },
        {
          "key": "keys.indexed.agents",
          "type": "string",
          "default": "unset",
          "description": "Modifier combo for agent shortcuts 1-9. Unset by default."
        }
      ]
    },
    {
      "id": "ui",
      "title": "UI and sidebar",
      "keys": [
        {
          "key": "ui.sidebar_width",
          "type": "integer",
          "default": "26",
          "description": "Default expanded sidebar width in columns. Auto-scales based on workspace names."
        },
        {
          "key": "ui.sidebar_min_width",
          "type": "integer",
          "default": "18",
          "description": "Minimum sidebar width (columns) when expanded."
        },
        {
          "key": "ui.sidebar_max_width",
          "type": "integer",
          "default": "36",
          "description": "Maximum sidebar width (columns) when expanded."
        },
        {
          "key": "ui.sidebar_start_collapsed",
          "type": "boolean",
          "default": "false",
          "description": "Start Herdr with the sidebar collapsed. Changes take effect on the next launch."
        },
        {
          "key": "ui.sidebar_collapsed_mode",
          "type": "enum",
          "default": "compact",
          "description": "Collapsed sidebar presentation.",
          "values": [
            "compact",
            "hidden"
          ]
        },
        {
          "key": "ui.mobile_width_threshold",
          "type": "integer",
          "default": "64",
          "description": "Terminal width at or below which Herdr uses the mobile single-column layout."
        },
        {
          "key": "ui.mouse_capture",
          "type": "boolean",
          "default": "true",
          "description": "Capture mouse input for Herdr's mouse UI."
        },
        {
          "key": "ui.copy_on_select",
          "type": "boolean",
          "default": "true",
          "description": "Automatically copy text selected by mouse drag or double-click. When disabled, Ctrl+C or a host-forwarded Cmd+C copies and clears the retained selection."
        },
        {
          "key": "ui.host_cursor",
          "type": "enum",
          "default": "auto",
          "description": "Host cursor policy.",
          "values": [
            "auto",
            "native",
            "drawn"
          ]
        },
        {
          "key": "ui.right_click_passthrough_modifier",
          "type": "string",
          "default": "\"\"",
          "description": "Modifier that lets right-click gestures pass through to pane apps. Empty disables it. Accepts ctrl, alt, cmd, super, meta, hyper, or a + separated combination; shift is rejected because many terminals reserve Shift+mouse."
        },
        {
          "key": "ui.redraw_on_focus_gained",
          "type": "boolean",
          "default": "true",
          "description": "Force a full host-terminal redraw when the outer terminal regains focus."
        },
        {
          "key": "ui.mouse_scroll_lines",
          "type": "integer",
          "default": "3",
          "description": "Lines to scroll per mouse wheel notch."
        },
        {
          "key": "ui.confirm_close",
          "type": "boolean",
          "default": "true",
          "description": "Ask for confirmation before closing a workspace."
        },
        {
          "key": "ui.prompt_new_tab_name",
          "type": "boolean",
          "default": "true",
          "description": "Ask for a tab name before creating a new tab."
        },
        {
          "key": "ui.prompt_new_workspace_name",
          "type": "boolean",
          "default": "false",
          "description": "Ask for a workspace name before interactive TUI creation."
        },
        {
          "key": "ui.pane_borders",
          "type": "enum",
          "default": "\"auto\"",
          "description": "Draw borders around split panes. auto draws them only for split panes, always also frames a lone pane (only while pane_outer_borders is enabled, since every edge of a lone pane is an outer edge), off disables them. Legacy booleans still parse: true maps to auto and false maps to off.",
          "values": [
            "auto",
            "always",
            "off"
          ]
        },
        {
          "key": "ui.pane_outer_borders",
          "type": "boolean",
          "default": "true",
          "description": "Draw borders along the outside edge of the pane area. Disable with pane gaps disabled for tmux-style internal splitters without an outside frame."
        },
        {
          "key": "ui.pane_scrollbars",
          "type": "boolean",
          "default": "true",
          "description": "Draw interactive scrollbars beside terminal panes. Disable to reclaim the scrollbar column and keep it out of terminal-native selections."
        },
        {
          "key": "ui.pane_gaps",
          "type": "boolean",
          "default": "true",
          "description": "Keep split panes visually separated instead of sharing divider borders."
        },
        {
          "key": "ui.show_agent_labels_on_pane_borders",
          "type": "boolean",
          "default": "false",
          "description": "Show agent labels in split pane borders when no manual pane label is set."
        },
        {
          "key": "ui.hide_tab_bar_when_single_tab",
          "type": "boolean",
          "default": "false",
          "description": "Hide the tab row when the workspace has one tab."
        },
        {
          "key": "ui.tab_bar_position",
          "type": "enum",
          "default": "\"top\"",
          "description": "Place the desktop tab row above or below the terminal panes.",
          "values": [
            "top",
            "bottom"
          ]
        },
        {
          "key": "ui.tab_bar_right",
          "type": "array",
          "default": "[]",
          "description": "Configure ordered right-aligned tab bar entries. Supported types are zoom, hostname, datetime, text, and command.",
          "values": [
            "zoom",
            "hostname",
            "datetime",
            "text",
            "command"
          ]
        },
        {
          "key": "ui.tab_bar_right_separator",
          "type": "string",
          "default": "\" \"",
          "description": "Text inserted between visible right-aligned tab bar entries."
        },
        {
          "key": "ui.window_title",
          "type": "string",
          "default": "\"{hostname}: {workspace}\"",
          "description": "Title Herdr writes to the terminal it runs in. Tokens: {hostname}, {workspace}, {tab}, {pane}, {terminal_title}. Empty leaves the outer title alone."
        },
        {
          "key": "ui.agent_panel_sort",
          "type": "enum",
          "default": "\"spaces\"",
          "description": "Agent sidebar ordering. Saved values are \"spaces\" or \"priority\"; \"workspaces\" is accepted as an alias for \"spaces\".",
          "values": [
            "spaces",
            "priority"
          ]
        },
        {
          "key": "ui.status_indicators",
          "type": "enum",
          "default": "\"dots\"",
          "description": "Choose compact color dots or distinct static symbols for agent states.",
          "values": [
            "dots",
            "symbols"
          ]
        },
        {
          "key": "ui.sidebar.agents.row_gap",
          "type": "integer",
          "default": "0",
          "description": "Blank terminal rows between expanded Agent sidebar entries. Set to 1 to restore the previous spacing."
        },
        {
          "key": "ui.sidebar.agents.rows",
          "type": "list of token rows",
          "default": "[[\"state_icon\", \"machine\", \"workspace\", \"tab\"], [\"agent\"]]",
          "description": "Default expanded Agent sidebar layout. Entries may be token strings or inline { token, fg, bold, dim, rules } style tables. Text-valued built-ins and $name metadata tokens accept up to 16 ordered rules using equals, contains, starts_with, gt, or lt; the first match overrides specified styles. Text conditions optionally accept ignore_case for ASCII matching; numeric conditions require full finite numbers. state_icon accepts fixed styles only. At most 16 rows and 16 tokens per row."
        },
        {
          "key": "ui.sidebar.agents.rows_by_agent",
          "type": "table of token rows",
          "default": "{}",
          "description": "Complete Agent-row overrides keyed by strict canonical agent id. Agents without an override use ui.sidebar.agents.rows."
        },
        {
          "key": "ui.sidebar.spaces.row_gap",
          "type": "integer",
          "default": "0",
          "description": "Blank terminal rows between worktree groups and unrelated top-level Spaces. Worktree parents and their indented children remain packed."
        },
        {
          "key": "ui.sidebar.spaces.rows",
          "type": "list of token rows",
          "default": "[[\"state_icon\", \"workspace\"], [\"branch\", \"git_status\"]]",
          "description": "Expanded Space sidebar layout. Entries may be token strings or inline { token, fg, bold, dim, rules } style tables. Text-valued built-ins and $name metadata tokens accept up to 16 ordered rules using equals, contains, starts_with, gt, or lt; the first match overrides specified styles. Text conditions optionally accept ignore_case for ASCII matching; numeric conditions require full finite numbers. state_icon and git_status accept fixed styles only. At most 16 rows and 16 tokens per row."
        },
        {
          "key": "ui.accent",
          "type": "color",
          "default": "\"cyan\"",
          "description": "Accent color for highlights, borders, and navigation UI. Accepts hex (#89b4fa), named colors (cyan, blue), or RGB (rgb(137,180,250))."
        }
      ]
    },
    {
      "id": "notifications",
      "title": "Notifications",
      "keys": [
        {
          "key": "ui.toast.delivery",
          "type": "enum",
          "default": "\"off\"",
          "description": "Popup notification delivery. off disables popups, herdr shows in-app toasts, terminal asks the outer terminal for a desktop notification, system asks the OS notification service directly.",
          "values": [
            "off",
            "herdr",
            "terminal",
            "system"
          ]
        },
        {
          "key": "ui.toast.delay_seconds",
          "type": "integer",
          "default": "1",
          "description": "Seconds to wait before sending finished or needs-input agent notifications. Herdr notifies only if the pane is still in the same state when the delay expires. 0 is instant; valid values are 0 through 3600."
        },
        {
          "key": "ui.toast.herdr.position",
          "type": "enum",
          "default": "\"bottom-right\"",
          "description": "In-app toast position, relative to the full Herdr frame.",
          "values": [
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right"
          ]
        },
        {
          "key": "ui.toast.clipboard.enabled",
          "type": "boolean",
          "default": "true",
          "description": "Show the copied-to-clipboard popup after a mouse copy."
        },
        {
          "key": "ui.toast.clipboard.position",
          "type": "enum",
          "default": "\"bottom-center\"",
          "description": "Copied-to-clipboard popup position.",
          "values": [
            "top-left",
            "top-center",
            "top-right",
            "bottom-left",
            "bottom-center",
            "bottom-right"
          ]
        }
      ]
    },
    {
      "id": "sound",
      "title": "Sound",
      "keys": [
        {
          "key": "ui.sound.enabled",
          "type": "boolean",
          "default": "true",
          "description": "Play sounds when agents change state in background workspaces."
        },
        {
          "key": "ui.sound.path",
          "type": "path",
          "default": "unset",
          "description": "Optional mp3 file path used for all notification sounds. Relative paths are resolved from the config file's directory."
        },
        {
          "key": "ui.sound.done_path",
          "type": "path",
          "default": "unset",
          "description": "Optional mp3 file path for \"done\" notifications. Relative paths are resolved from the config file's directory."
        },
        {
          "key": "ui.sound.request_path",
          "type": "path",
          "default": "unset",
          "description": "Optional mp3 file path for \"request\" notifications. Relative paths are resolved from the config file's directory."
        },
        {
          "key": "ui.sound.agents.pi",
          "type": "enum",
          "default": "\"default\"",
          "description": "Sound override for detected Pi agents.",
          "values": [
            "default",
            "on",
            "off"
          ]
        },
        {
          "key": "ui.sound.agents.claude",
          "type": "enum",
          "default": "\"default\"",
          "description": "Sound override for detected Claude Code agents.",
          "values": [
            "default",
            "on",
            "off"
          ]
        },
        {
          "key": "ui.sound.agents.codex",
          "type": "enum",
          "default": "\"default\"",
          "description": "Sound override for detected Codex agents.",
          "values": [
            "default",
            "on",
            "off"
          ]
        },
        {
          "key": "ui.sound.agents.gemini",
          "type": "enum",
          "default": "\"default\"",
          "description": "Sound override for detected Gemini CLI agents.",
          "values": [
            "default",
            "on",
            "off"
          ]
        },
        {
          "key": "ui.sound.agents.cursor",
          "type": "enum",
          "default": "\"default\"",
          "description": "Sound override for detected Cursor Agent CLI agents.",
          "values": [
            "default",
            "on",
            "off"
          ]
        },
        {
          "key": "ui.sound.agents.devin",
          "type": "enum",
          "default": "\"default\"",
          "description": "Sound override for detected Devin agents.",
          "values": [
            "default",
            "on",
            "off"
          ]
        },
        {
          "key": "ui.sound.agents.agy",
          "type": "enum",
          "default": "\"default\"",
          "description": "Sound override for detected Agy agents.",
          "values": [
            "default",
            "on",
            "off"
          ]
        },
        {
          "key": "ui.sound.agents.cline",
          "type": "enum",
          "default": "\"default\"",
          "description": "Sound override for detected Cline agents.",
          "values": [
            "default",
            "on",
            "off"
          ]
        },
        {
          "key": "ui.sound.agents.open_code",
          "type": "enum",
          "default": "\"default\"",
          "description": "Sound override for detected OpenCode agents.",
          "values": [
            "default",
            "on",
            "off"
          ]
        },
        {
          "key": "ui.sound.agents.github_copilot",
          "type": "enum",
          "default": "\"default\"",
          "description": "Sound override for detected GitHub Copilot CLI agents.",
          "values": [
            "default",
            "on",
            "off"
          ]
        },
        {
          "key": "ui.sound.agents.kimi",
          "type": "enum",
          "default": "\"default\"",
          "description": "Sound override for detected Kimi Code CLI agents.",
          "values": [
            "default",
            "on",
            "off"
          ]
        },
        {
          "key": "ui.sound.agents.kiro",
          "type": "enum",
          "default": "\"default\"",
          "description": "Sound override for detected Kiro agents.",
          "values": [
            "default",
            "on",
            "off"
          ]
        },
        {
          "key": "ui.sound.agents.droid",
          "type": "enum",
          "default": "\"off\"",

...7939 bytes truncated...

The tool call succeeded but the output was truncated. Full output saved to: ~/.local/share/opencode/tool-output/tool_19d0ae4c4001v3fk3FisQiohqN
Use Grep to search the full content or Read with offset/limit to view specific sections.
```


---

## Assistant (Explore · Claude Sonnet 5.5 · 1.6s)

**Tool: grep**

**Input:**
```json
{
  "pattern": "(?i)worktree",
  "path": "~/.local/share/opencode/tool-output/tool_19d0ae4c4001v3fk3FisQiohqN"
}
```

**Output:**
```
Found 29 matches
~/.local/share/opencode/tool-output/tool_19d0ae4c4001v3fk3FisQiohqN:
  Line 509:           "key": "keys.new_worktree",

  Line 512:           "description": "Create a Git worktree from the selected workspace."

  Line 515:           "key": "keys.open_worktree",

  Line 518:           "description": "Open an existing Git worktree from the selected workspace. Unset by default."

  Line 521:           "key": "keys.remove_worktree",

  Line 524:           "description": "Delete the selected managed worktree checkout after confirmation. Unset by default."

  Line 1085:           "description": "Blank terminal rows between worktree groups and unrelated top-level Spaces. Worktree parents and their indented children remain packed."

  Line 1448:       "id": "worktrees",

  Line 1449:       "title": "Worktrees",

  Line 1452:           "key": "worktrees.directory",

  Line 1454:           "default": "\"~/.herdr/worktrees\"",


~/.local/share/opencode/tool-output/tool_19cd90d46001aC2OsRI3ncVEDT:
  Line 469:     "worktree": {

  Line 470:       "$ref": "#/$defs/Config.Worktree",

  Line 471:       "description": "Directory defaults for local worktree creation"

  Line 2126:     "Config.Worktree": {


~/.local/share/opencode/tool-output/tool_18d87832d001qXgoEX32sueWs4:
  Line 1: 97:    Skip to contentmise-en-placeSearchK Main Navigation Dev toolsEnvironmentsTasksBootstrapReferenceCLI commandsmise.tomlSettingsMISE_* variablesTask configurationTool registryTroubleshootingError messagesGlossarymise-versionsv2026.10.24AppearanceMenuReturn to top Sidebar Navigation Start hereGetting startedInstalling miseShell setupExisting projectsEditors and IDEsContinuous integrationDockerAI assistants (MCP)Dev toolsOverviewVersion requests and version filesRegistryBackendsaquaasdf (legacy)cargocondadotnetforgejogemgithubgitlabgohttpnpmpackslipVerification and policyMan pages, completions, and skillspypis3spinel (experimental)spmubi (deprecated)vfoxShimsTool aliasesTool stubsSelf-updating toolsLockfile (mise.lock)mise.lock referenceGit provider tokensSystem installsOCI images (experimental)Identity install layout (experimental)Migrating from asdfLanguagesCore tools overviewBunDeno.NETElixirErlangGoJavaNode.jsPythonRubyRustSwiftZigEnvironmentsEnvironment variablesSecretsfnox (experimental)SOPS filesage values (experimental)Shell aliasesHooksMigrating from direnvTasksOverviewTOML tasksFile tasksTask argumentsRunning tasksTask discovery and precedenceDependencies and execution orderTask templatesTask cachingRemote task cacheRemote cache protocolMonorepo tasksWorkspace project graph (experimental)Project dependencies (experimental)OpenTelemetry (experimental)Task configuration referenceDaemons (experimental)OverviewSet up a development stackService presetsContainer daemonsPorts, URLs, and worktreesShare daemons across projectsData and cleanupBootstrapOverviewSet up a machineBootstrap from a repositoryMachine modulesRemote hostsGitHub relay (mise ssh)Packagesapkaptaurbrewbrew-caskchocodnfflatpakmacos-appmasnixpacmanscoopsnapwingetzypperPackage manager pluginsHost setupLinux users and groupsSystem files and directoriesSecret inputsServicesLinux firewallDocker Compose projectsYour environmentGit repositoriesShell activation and login shellPlatform-specificmacOS defa...
  Line 5: 128:    window.__VP_HASH_MAP__=JSON.parse("{\"about.md\":\"spgm3adL\",\"architecture.md\":\"BUGUh94y\",\"asdf-legacy-plugins.md\":\"usbwvVGk\",\"backend-plugin-development.md\":\"BDuJBZwl\",\"bootstrap.md\":\"2pPxpwHu\",\"bootstrap_accounts.md\":\"ax4Z4oxt\",\"bootstrap_compose.md\":\"CNZGqH3K\",\"bootstrap_files.md\":\"B6O783cf\",\"bootstrap_firewall.md\":\"E_BtqO_h\",\"bootstrap_from-repository.md\":\"CCj3mjEc\",\"bootstrap_github-relay.md\":\"V0cX2oWM\",\"bootstrap_launchd.md\":\"VSrCALT-\",\"bootstrap_macos-defaults.md\":\"DbV-8xAd\",\"bootstrap_modules.md\":\"Bk4lMuXm\",\"bootstrap_packages_apk.md\":\"CJ-9hbc4\",\"bootstrap_packages_apt.md\":\"Q_DMbcvI\",\"bootstrap_packages_aur.md\":\"BZDTKf25\",\"bootstrap_packages_brew-cask.md\":\"Dk387E-p\",\"bootstrap_packages_brew.md\":\"kWqT_Cfd\",\"bootstrap_packages_choco.md\":\"z039hL1P\",\"bootstrap_packages_dnf.md\":\"BCvCVdsQ\",\"bootstrap_packages_flatpak.md\":\"DZkiaJez\",\"bootstrap_packages_index.md\":\"A3VQYMUA\",\"bootstrap_packages_macos-app.md\":\"DaLh6zkr\",\"bootstrap_packages_mas.md\":\"CxNsYvrv\",\"bootstrap_packages_nix.md\":\"C7VFbjDd\",\"bootstrap_packages_pacman.md\":\"76hkgMFl\",\"bootstrap_packages_plugins.md\":\"DbSvf00V\",\"bootstrap_packages_scoop.md\":\"E-90hJ2C\",\"bootstrap_packages_snap.md\":\"PoJxZaJG\",\"bootstrap_packages_winget.md\":\"D9zoYvd-\",\"bootstrap_packages_zypper.md\":\"CgQ9dUXc\",\"bootstrap_remote.md\":\"BYO_NLtQ\",\"bootstrap_repos.md\":\"D7CIq4w1\",\"bootstrap_secrets.md\":\"BuZ7l7X0\",\"bootstrap_services.md\":\"bUz8self\",\"bootstrap_setup.md\":\"DWTvkazW\",\"bootstrap_shell.md\":\"Bm-37vuj\",\"bootstrap_systemd.md\":\"7PDCZv-t\",\"cache-behavior.md\":\"DkGq7tYD\",\"cli_activate.md\":\"CXvEA-2I\",\"cli_backends.md\":\"CUTOLezi\",\"cli_backends_ls.md\":\"DZN4ABok\",\"cli_backends_switch.md\":\"LBmo24zA\",\"cli_bin-paths.md\":\"DpB2xtTS\",\"cli_bootstrap.md\":\"KYtUzCoa\",\"cli_bootstrap_accounts.md\":\"DBYFmg8l\",\"cli_bootstrap_accounts_apply.md\":\"D4MqNXzl\",\"cli_boot...

~/.local/share/opencode/tool-output/tool_19bf6c81b001w7CZM0GF2DWnaa:
  Line 469:     "worktree": {

  Line 470:       "$ref": "#/$defs/Config.Worktree",

  Line 471:       "description": "Directory defaults for local worktree creation"

  Line 2126:     "Config.Worktree": {


~/.local/share/opencode/tool-output/tool_18ca89c9d001ls84U17lf4pFP0:
  Line 2487: Useful for CI environments where you want a report rather than fixes. By convention a check command only reports problems, but hk does not enforce that, so this selects which command runs rather than guaranteeing an unchanged worktree.

  Line 2916: Seconds to wait for another hk process to finish stashing in the same worktree.

  Line 2918: While hk holds unstaged changes aside, it keeps a lock in the worktree's own git directory (`hk-stash.lock`). Hooks in other linked worktrees do not wait for it. A second hk process in the same worktree that needs to stash waits for the first to restore its changes, printing a message while it waits, and fails naming the lock file if the wait passes this limit.

  Line 2942: Default: inside a repository, hk keeps its state in the git directory instead (`<git-dir>/hk/output.log` and `hk.log` per checkout, `<common-git-dir>/hk/patches/` shared by a repository's linked worktrees). Outside a repository it uses `~/.local/state/hk`. Setting this variable puts everything under that directory.


~/.local/share/opencode/tool-output/tool_1922e41d2001D20exUDwkbkbcV:
  Line 1: 84:          "text": "<path>~/.config/nvim/ROADMAP.md</path>\n<type>file</type>\n<content>\n1: # ROADMAP: Neovim config refresh and orchestration experiment\n2: \n3: \n4: This is the master plan for refreshing this LazyVim config.\n5: It is also the runbook of a measured multi-agent orchestration experiment: parallel sessions, one git worktree and one herdr tab each.\n6: It was produced by Session 0 on 2026-10-30 and replaces `TODO.md` (see \"TODO.md mapping\").\n7: \n8: How to use it:\n9: \n10: - Every session is a fresh agent conversation that executes exactly one section `S<N>` below.\n11: - S1 and S2 are bootstrap sessions: they run in the main checkout `~/.config/nvim`, started by hand with the prompt `Execute Session S<N> from @ROADMAP.md`.\n12: - From S3 onward, start sessions from the main checkout with `mise run session:start S<N>` (built in S2).\n13: - Agents read: `AGENTS.md`, then from this file only Workflow settings, Global context, Decisions, Gate types, Validation gates, Telemetry, Session protocol and their own `S<N>` section.\n14: - Facts and line numbers are a snapshot from 2026-10-30. Sessions re-verify anything they rely on, because earlier merges move lines.\n15: \n16: \n17: ## Workflow settings\n18: \n19: These lines are machine-read by `mise run session:start` and `mise run roadmap` (S2). Keep the `- key: value` format; `{change-id}` is substituted per session.\n20: \n21: - max_parallel: unlimited\n22: - worktrees_root: [redacted:worktrees_root]\n23: - worktree_name: nvim-{change-id}\n24: - nvim_appname: nvim-wt/{change-id}\n25: - herdr_workspace: neovim\n26: - telemetry: ~/.local/state/orchestration/nvim.jsonl\n27: - github_repo: [redacted:repo]\n28: \n29: \n30: ## Global context (snapshot 2026-10-30)\n31: \n32: \n33: ### Environment\n34: \n35: - nvim 0.12.5, Python 3.14.8, Node 26, tmux 3.7c, herdr 0.9.5 (client and server), mise 2026.9.5, git 2.55.0, OpenSpec CLI at `/home/linuxbrew/.linuxbrew/bin/openspec`.\n36: - `gh` is logged in as `silopo...
  Line 2: 186:            "output": "<path>~/.config/nvim/ROADMAP.md</path>\n<type>file</type>\n<content>\n533: **Acceptance**: no dead specs; keymaps match D6; G2 green; live editor in sync.\n534: \n535: **Log**:\n536: \n537: \n538: ## S10: consolidate-ltex-integration\n539: \n540: **Branch**: `refactor/consolidate-ltex-integration`.\n541: \n542: **Goal**: no globals, a single language sync path, LTeX rule files loaded at startup.\n543: \n544: **Spec delta**: update `ltex-spell-integration` (including the `<leader>tl` keymap and the `:MdSpelllang [en|fr]` interface, which must stay stable for S7).\n545: \n546: **Context**:\n547: \n548: - `lua/plugins/ltex.lua`: helpers on lines 24-160; `_G.ltex_utils` assigned at module load (169-218); used by `lua/config/autocmds.lua:82-83,98-140` and by `:MdSpelllang` (`autocmds.lua:66`).\n549: - The sync fires four times: LspAttach 300 ms (`autocmds.lua:98`), FileType 150 ms (`:114`), BufReadPost 100 ms (`:129`), `on_attach` 200 ms (`ltex.lua:294`). `ltex_extra.setup` runs on every attach (336-340) and dictionaries load after 500 ms with a notification each time (383).\n550: - `init_check = false` (338) probably means `spell/ltex.*.fr.txt` is not loaded at startup.\n551: - `<leader>tl` (`lua/config/keymaps.lua:20`) allows 5 filetypes while the server covers 19.\n552: - Testing `zg` or add-to-dictionary in the worktree writes `spell/*.add` in the worktree; restore those files unless a change is intended.\n553: \n554: **Checklist**:\n555: \n556: - [ ] Move the helpers to a `lua/util/ltex.lua` module; `ltex.lua`, `autocmds.lua` and `:MdSpelllang` require it.\n557: - [ ] One sync path: LspAttach for `ltex_plus`, plus `:MdSpelllang`. Remove the duplicates.\n558: - [ ] Test whether the rule files load: add a false positive, restart, check it is hidden. If not, use `init_check = true` or load them explicitly.\n559: - [ ] Notifications at DEBUG level, or only when something changes.\n560: - [ ] `<leader>tl` takes its filetypes from the ...
  Line 3: 188:              "preview": "**Acceptance**: no dead specs; keymaps match D6; G2 green; live editor in sync.\n\n**Log**:\n\n\n## S10: consolidate-ltex-integration\n\n**Branch**: `refactor/consolidate-ltex-integration`.\n\n**Goal**: no globals, a single language sync path, LTeX rule files loaded at startup.\n\n**Spec delta**: update `ltex-spell-integration` (including the `<leader>tl` keymap and the `:MdSpelllang [en|fr]` interface, which must stay stable for S7).\n\n**Context**:\n\n- `lua/plugins/ltex.lua`: helpers on lines 24-160; `_G.ltex_utils` assigned at module load (169-218); used by `lua/config/autocmds.lua:82-83,98-140` and by `:MdSpelllang` (`autocmds.lua:66`).\n- The sync fires four times: LspAttach 300 ms (`autocmds.lua:98`), FileType 150 ms (`:114`), BufReadPost 100 ms (`:129`), `on_attach` 200 ms (`ltex.lua:294`). `ltex_extra.setup` runs on every attach (336-340) and dictionaries load after 500 ms with a notification each time (383).\n- `init_check = false` (338) probably means `spell/ltex.*.fr.txt` is not loaded at startup.\n- `<leader>tl` (`lua/config/keymaps.lua:20`) allows 5 filetypes while the server covers 19.\n- Testing `zg` or add-to-dictionary in the worktree writes `spell/*.add` in the worktree; restore those files unless a change is intended.",

  Line 4: 194:                "text": "**Acceptance**: no dead specs; keymaps match D6; G2 green; live editor in sync.\n\n**Log**:\n\n\n## S10: consolidate-ltex-integration\n\n**Branch**: `refactor/consolidate-ltex-integration`.\n\n**Goal**: no globals, a single language sync path, LTeX rule files loaded at startup.\n\n**Spec delta**: update `ltex-spell-integration` (including the `<leader>tl` keymap and the `:MdSpelllang [en|fr]` interface, which must stay stable for S7).\n\n**Context**:\n\n- `lua/plugins/ltex.lua`: helpers on lines 24-160; `_G.ltex_utils` assigned at module load (169-218); used by `lua/config/autocmds.lua:82-83,98-140` and by `:MdSpelllang` (`autocmds.lua:66`).\n- The sync fires four times: LspAttach 300 ms (`autocmds.lua:98`), FileType 150 ms (`:114`), BufReadPost 100 ms (`:129`), `on_attach` 200 ms (`ltex.lua:294`). `ltex_extra.setup` runs on every attach (336-340) and dictionaries load after 500 ms with a notification each time (383).\n- `init_check = false` (338) probably means `spell/ltex.*.fr.txt` is not loaded at startup.\n- `<leader>tl` (`lua/config/keymaps.lua:20`) allows 5 filetypes while the server covers 19.\n- Testing `zg` or add-to-dictionary in the worktree writes `spell/*.add` in the worktree; restore those files unless a change is intended.\n\n**Checklist**:\n\n- [ ] Move the helpers to a `lua/util/ltex.lua` module; `ltex.lua`, `autocmds.lua` and `:MdSpelllang` require it.\n- [ ] One sync path: LspAttach for `ltex_plus`, plus `:MdSpelllang`. Remove the duplicates.\n- [ ] Test whether the rule files load: add a false positive, restart, check it is hidden. If not, use `init_check = true` or load them explicitly.\n- [ ] Notifications at DEBUG level, or only when something changes.\n- [ ] `<leader>tl` takes its filetypes from the server config.\n- [ ] G2 passes. `[interactive]` on a French and an English file: `zg`, the add-to-dictionary code action, `:MdSpelllang en` and `:MdSpelllang fr`.\n\n**Acceptance**: no `_G` writes under `lua/plugins/`...
```


---

## Assistant (Explore · Claude Sonnet 5.5 · 1.4s)

**Tool: read**

**Input:**
```json
{
  "filePath": "~/.local/share/opencode/tool-output/tool_19d0ae4c4001v3fk3FisQiohqN",
  "offset": 1440,
  "limit": 40
}
```

**Output:**
```
<path>~/.local/share/opencode/tool-output/tool_19d0ae4c4001v3fk3FisQiohqN</path>
<type>file</type>
<content>
1440:           "key": "session.startup_per_agent_delay_ms",
1441:           "type": "integer",
1442:           "default": "100",
1443:           "description": "Milliseconds between automatic agent restores after a server restart. The first agent starts without this delay; 0 disables spacing. Does not delay manual launches or explicit terminal attaches. Restart the server to apply."
1444:         }
1445:       ]
1446:     },
1447:     {
1448:       "id": "worktrees",
1449:       "title": "Worktrees",
1450:       "keys": [
1451:         {
1452:           "key": "worktrees.directory",
1453:           "type": "string",
1454:           "default": "\"~/.herdr/worktrees\"",
1455:           "description": "Root directory under which Herdr creates <repo>/<branch-slug> checkouts."
1456:         }
1457:       ]
1458:     },
1459:     {
1460:       "id": "remote",
1461:       "title": "Remote",
1462:       "keys": [
1463:         {
1464:           "key": "remote.manage_ssh_config",
1465:           "type": "boolean",
1466:           "default": "true",
1467:           "description": "Add keepalive fallbacks and private connection reuse for `herdr --remote`. Set false to run plain ssh unchanged."
1468:         }
1469:       ]
1470:     },
1471:     {
1472:       "id": "advanced",
1473:       "title": "Advanced",
1474:       "keys": [
1475:         {
1476:           "key": "advanced.scrollback_limit_bytes",
1477:           "type": "integer",
1478:           "default": "10000000",
1479:           "description": "Maximum scrollback buffer size in bytes retained per pane terminal. The legacy key name `scrollback_lines` is accepted as an alias."

(Showing lines 1440-1479 of 1540. Use offset=1480 to continue.)
</content>
```


---

## Assistant (Explore · Claude Sonnet 5.5 · 16.9s)

Summary of herdr v0.9.5 docs on worktrees, plus tab/workspace options and session restore.

**Worktree CLI (cli-reference.mdx, "Worktrees" section)**
- `herdr worktree list [--workspace ID | --cwd PATH] [--trust-repository]`
- `herdr worktree create [--workspace ID | --cwd PATH] [--branch NAME] [--base REF] [--path PATH] [--label TEXT] [--focus] [--no-focus] [--trust-repository]`
- `herdr worktree open [--workspace ID | --cwd PATH] (--path PATH | --branch NAME) [--label TEXT] [--focus] [--no-focus] [--trust-repository]`
- `herdr worktree remove --workspace ID [--force] [--trust-repository]`
- Quote: "Worktrees are normal Herdr workspaces with Git checkout provenance." `create` makes the Git worktree checkout, opens it as a workspace, and "groups it with the parent repo workspace".
- Branch naming: if `--branch` names an existing local branch, Herdr checks it out. Otherwise it creates the branch from `--base`, or from `HEAD` if `--base` is absent.
- Checkout location: without `--path`, the checkout goes under `<worktrees.directory>/<repo>/<branch-slug>`.
- Config key `worktrees.directory`: type string, default `"~/.herdr/worktrees"`. Its description is "Root directory under which Herdr creates <repo>/<branch-slug> checkouts." It is the only worktree location key. Section id is `worktrees`.
- `worktree remove` runs `git worktree remove`, "never deletes the branch", and needs `--force` when Git refuses a dirty checkout.
- `workspace close` "closes only Herdr state" and leaves the checkout on disk. Deleting the checkout requires `worktree remove`.
- Group close: closing a primary workspace while linked-worktree workspaces are open needs `--group`. Without it, the group stays open and the command returns the error `workspace_group_close_required`.
- `tab close`: if `ui.confirm_close` is on and closing the tab would close a whole worktree group, it returns a `confirmation_required` error.
- `--trust-repository`: Git rejects repositories owned by another user by default. The flag trusts the resolved path "for that command only", and Herdr does not change your Git config.
- Remote use: `herdr --machine "Build machine" worktree create --cwd /srv/project --branch review`. Remote worktree paths must be absolute, `~`, or start with `~/`, and are expanded on the server.
- Plugins: the plugin example `ogulcancelik/herdr-plugin-examples/worktree-bootstrap` is mentioned as an install example.

**Worktree keybindings and sidebar (config-reference.json)**
- `keys.new_worktree` defaults to `"prefix+shift+g"` ("Create a Git worktree from the selected workspace").
- `keys.open_worktree` is unset by default.
- `keys.remove_worktree` is unset by default. Description: "Delete the selected managed worktree checkout after confirmation."
- `ui.sidebar.spaces.row_gap` defaults to `0`. It sets "Blank terminal rows between worktree groups and unrelated top-level Spaces. Worktree parents and their indented children remain packed."
- So linked worktrees appear in the sidebar's Space list as indented children under their parent repo workspace.
- `ui.sidebar.spaces.rows` defaults to `[["state_icon", "workspace"], ["branch", "git_status"]]`, which shows the branch and git status per Space.
- `ui.confirm_close` defaults to `true`.

**`herdr workspace create`**
- `herdr workspace create [--cwd PATH] [--label TEXT] [--env KEY=VALUE] [--focus] [--no-focus]`
- It also creates the first tab and root pane. The response has `.result.workspace.workspace_id`, `.result.tab.tab_id` and `.result.root_pane.pane_id`.
- Related commands: `workspace list|get|focus|rename|report-metadata`, and `workspace close <id> [--group]`.

**`herdr tab create`**
- `herdr tab create [--workspace <workspace_id>] [--cwd PATH] [--label TEXT] [--env KEY=VALUE] [--focus] [--no-focus]`
- Without `--workspace` it uses the active workspace and fails if none exists.
- The response has `.result.tab` and `.result.root_pane`.
- Focus is unchanged by default. `--focus` selects the new layout, and `--no-focus` states the default explicitly.
- Without `--cwd`, the `terminal.new_cwd` policy applies: values `follow` (default), `home`, `current`, `path`.
- Each `--env` adds or replaces a variable in the new root shell. It can be repeated.
- The `ui.prompt_new_tab_name` default is `true`. It applies only to the TUI.

**Session restore (session-state.mdx)**
- Yes, opencode agents are resumed after a server restart, subject to conditions below.
- Native agent session restore is on by default. Setting `[session] resume_agents_on_restore = false` disables it.
- OpenCode needs integration version `5` or newer. The resume command is `opencode --session <id>`. Run `herdr integration install opencode` and `herdr integration status` to check.
- Only panes that reported a native session reference through an official integration, or whose agent reported its own resume command, are resumed.
- Unsupported, missing, invalid, duplicated or stale references restore as plain shells in the saved cwd.
- Resume happens after a client attaches and provides terminal size and theme. Eligible panes across all workspaces and tabs resume without needing focus.
- `session.startup_per_agent_delay_ms` defaults to `100`. It spaces automatic restores, and the first agent starts without the delay.
- Server restart does not keep processes running. It restores workspaces, tabs, panes, cwd, layout and focus. Recent screen content returns only if `[experimental] pane_history = true`, which is off by default.
- Detach and reattach keeps everything running.
- Resume commands run only for `agent start` kinds or hooks that report them. `pane report-agent` takes `-- RESUME_COMMAND...`. The first argument must be a plain command on `PATH`, and no argument may contain an apostrophe.

**Not stated in the docs**
- concepts.mdx and agent-automation.mdx say nothing about worktrees, workspace groups or `--group`.
- No exact slug rules for `<branch-slug>`, for example how `/` in `feature/x` is handled.
- No default branch name when `--branch` is omitted, and no default `--label`.
- No JSON response schema for `worktree create|open|list|remove`. The doc doesn't say whether `.result.workspace` or `.result.root_pane` appear, or what `list` returns.
- No statement on what `worktree remove` does to the workspace entry beyond running `git worktree remove`. It does not say if the Herdr workspace closes, or what happens to other linked workspaces.
- No statement on whether `worktree remove` works on the primary workspace's checkout.
- No statement on how a group is persisted across restart, or whether worktrees are listed in `workspace list` with a parent or group field.
- No detail on what `worktree open` does when the checkout is already open, or whether `--branch` there needs the branch to be checked out in an existing worktree.
- No mention of a worktree-specific `workspace create` option.
- `worktrees.directory` is the only location key found, and there are no per-repo overrides.

---

