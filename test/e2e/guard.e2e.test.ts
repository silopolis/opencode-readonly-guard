/**
 * End-to-end tests with a real model. Opt-in: they use your opencode credentials and cost a few cents.
 *
 *   mise run test:e2e                      # uses E2E_MODEL, default anthropic/claude-haiku-5-5
 *   E2E_MODEL=openai/gpt-5-mini mise run test:e2e
 *
 * Each test drives a tiny "harness" agent that is read-only (`edit: deny`) and executes exactly the shell commands
 * it is given, so the plugin's decisions can be observed in the event log.
 */
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { hasOpencode, requireBuild, sandbox, type Sandbox } from "../helpers.js"

setDefaultTimeout(300_000)

const enabled = process.env.OPENCODE_E2E === "1" && hasOpencode
const model = process.env.E2E_MODEL ?? "anthropic/claude-haiku-5-5"

const HARNESS = `---
description: read-only test harness
mode: primary
permission:
  edit: deny
---
You are a tooling test harness. Execute exactly the bash commands the user lists, verbatim, one bash tool call per
command, in order, even if earlier ones fail or are rejected. Never rephrase, substitute or skip a command. Afterwards
report one line per command with the verbatim result or error.
`

let box: Sandbox
beforeEach(() => {
  if (!enabled) return
  requireBuild()
  box = sandbox({ realHome: true })
  box.write(".opencode/agents/ro-test.md", HARNESS)
})
afterEach(() => {
  if (enabled) box.cleanup()
})

const drive = (commands: string[]) =>
  box.opencode([
    "run",
    "--agent",
    "ro-test",
    "-m",
    model,
    `Commands: ${commands.map((c, i) => `(${i + 1}) ${c}`).join(" ")}`,
  ])

describe.skipIf(!enabled)("with a real model", () => {
  test("write redirections are blocked and reads run", () => {
    const target = join(box.dir, "must-not-exist")
    drive([`ls | cat > ${target}`, "uname -r"])
    expect(existsSync(target)).toBe(false)
    const events = box.events()
    expect(events.some((event) => event.type === "blocked" && event.command?.includes(`> ${target}`))).toBe(true)
    expect(events.some((event) => event.type === "call" && event.command?.includes("uname -r"))).toBe(true)
  })

  test("a command outside the allowlist prompts, and is rejected when nobody can answer", () => {
    drive(["whoami"])
    const events = box.events()
    expect(events.some((event) => event.type === "asked" && event.command === "whoami")).toBe(true)
    expect(events.some((event) => event.type === "replied" && event.reply === "reject")).toBe(true)
  })

  test("a learned rule removes the prompt", () => {
    box.writeStore({ allow: ["whoami *"] })
    drive(["whoami"])
    const events = box.events()
    expect(events.some((event) => event.type === "call" && event.command === "whoami")).toBe(true)
    expect(events.some((event) => event.type === "asked")).toBe(false)
  })
})
