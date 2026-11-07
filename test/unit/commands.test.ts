import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EXIT, runCli, type CliIo } from "../../src/commands.js"
import { createLog } from "../../src/log.js"

let dir: string
let stdout: string
let stderr: string
let ran: [string, string[]][]

const io = (env: NodeJS.ProcessEnv = {}): CliIo => ({
  out: (text) => void (stdout += text),
  err: (text) => void (stderr += text),
  env: {
    READONLY_GUARD_STORE: join(dir, "store.json"),
    READONLY_GUARD_DATA: join(dir, "log"),
    HERDR_CONFIG_PATH: join(dir, "herdr", "config.toml"),
    ...env,
  },
  cwd: dir,
  run: (command, args) => {
    ran.push([command, args])
    return 0
  },
  exec: (command) => ({ status: null, stdout: "", stderr: "", error: `${command}: not available in these tests` }),
})
const cli = (...argv: string[]) => runCli(argv, io())
/** Run as if started from a herdr pane. */
const inHerdr = (...argv: string[]) => runCli(argv, io({ HERDR_ENV: "1" }))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rg-cli-"))
  stdout = ""
  stderr = ""
  ran = []
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe("help and version", () => {
  test("prints usage and fails without a command", () => {
    expect(cli()).toBe(EXIT.usage)
    expect(stdout).toContain("Usage: opencode-readonly-guard")
  })

  test("--help succeeds", () => {
    expect(cli("--help")).toBe(0)
    expect(stdout).toContain("check [--json]")
    expect(stdout).toContain("doctor [--json]")
  })

  test("--version prints the package version", () => {
    expect(cli("--version")).toBe(0)
    expect(stdout).toMatch(/^\d+\.\d+\.\d+/)
  })

  test("unknown commands are usage errors", () => {
    expect(cli("frobnicate")).toBe(EXIT.usage)
    expect(stderr).toContain("unknown command: frobnicate")
  })
})

describe("check", () => {
  test("allow, ask and block map to exit statuses", () => {
    expect(cli("check", "ls -la")).toBe(EXIT.allow)
    expect(stdout).toBe("allow\n")
    stdout = ""
    expect(cli("check", "uptime")).toBe(EXIT.ask)
    expect(stdout).toBe("ask    needs approval: uptime\n")
    stdout = ""
    expect(cli("check", "ls", ">", "f")).toBe(EXIT.block)
    expect(stdout).toBe('block  write redirection "> f"\n')
  })

  test("--json prints the decision", () => {
    cli("check", "--json", "ls > f")
    expect(JSON.parse(stdout)).toEqual({ command: "ls > f", verdict: "block", reason: 'write redirection "> f"' })
  })

  test("learned rules from the store are taken into account, unless --no-store", () => {
    writeFileSync(join(dir, "store.json"), JSON.stringify({ allow: ["uptime *"] }))
    expect(cli("check", "uptime")).toBe(EXIT.allow)
    expect(cli("check", "--no-store", "uptime")).toBe(EXIT.ask)
  })

  test("inside herdr the UI commands are allowed, anywhere else they ask", () => {
    const rename = "herdr tab rename w1:t1 plan ready"
    expect(cli("check", rename)).toBe(EXIT.ask)
    expect(inHerdr("check", rename)).toBe(EXIT.allow)
    expect(inHerdr("check", "herdr notification show done")).toBe(EXIT.allow)
    // the neighbours still ask
    expect(inHerdr("check", "herdr tab close w1:t1")).toBe(EXIT.ask)
    expect(inHerdr("check", "herdr agent prompt reviewer hi")).toBe(EXIT.ask)
  })

  test("the store can switch the herdr-ui preset off, and --no-store ignores presets too", () => {
    const rename = "herdr tab rename w1:t1 plan ready"
    writeFileSync(join(dir, "store.json"), JSON.stringify({ presets: { "herdr-ui": false } }))
    expect(inHerdr("check", rename)).toBe(EXIT.ask)
    writeFileSync(join(dir, "store.json"), JSON.stringify({ allow: ["herdr tab rename *"] }))
    expect(inHerdr("check", rename)).toBe(EXIT.allow)
    expect(cli("check", rename)).toBe(EXIT.ask) // a listed UI command only applies inside herdr
    expect(inHerdr("check", "--no-store", rename)).toBe(EXIT.ask)
  })

  test("herdr's rules file applies inside herdr only, and --no-store ignores it", () => {
    mkdirSync(join(dir, "herdr"))
    writeFileSync(
      join(dir, "herdr", "readonly-guard.json"),
      JSON.stringify({ presets: { "herdr-ui": false }, allow: ["herdr notification show *"] }),
    )
    expect(inHerdr("check", "herdr notification show done")).toBe(EXIT.allow)
    expect(inHerdr("check", "herdr tab rename w1:t1 x")).toBe(EXIT.ask)
    expect(cli("check", "herdr notification show done")).toBe(EXIT.ask)
    expect(inHerdr("check", "--no-store", "herdr notification show done")).toBe(EXIT.ask)
  })

  test("needs a command", () => {
    expect(cli("check")).toBe(EXIT.usage)
  })
})

describe("vet", () => {
  test("accepts and refuses patterns", () => {
    expect(cli("vet", "uptime", "*")).toBe(0)
    expect(stdout).toContain("ok")
    expect(cli("vet", "rm *")).toBe(1)
    expect(stdout).toContain("refused")
  })

  test("needs a pattern", () => {
    expect(cli("vet")).toBe(EXIT.usage)
  })
})

describe("rules", () => {
  test("lists the allowlist and the ask flags", () => {
    expect(cli("rules")).toBe(0)
    expect(stdout).toContain("Allowed without a prompt")
    expect(stdout).toContain("git log*")
    expect(stdout).toContain("Always ask")
    expect(stdout).toContain("*-delete*")
    expect(stdout).toMatch(/Allowed after the ask flags: \d+ exact help commands, e\.g\. git \S+ --help/)
  })

  test("--json is machine readable", () => {
    cli("rules", "--json")
    const parsed = JSON.parse(stdout) as { allow: unknown[]; ask: unknown[]; help: string[] }
    expect(parsed.allow.length).toBeGreaterThan(10)
    expect(parsed.ask.length).toBeGreaterThan(5)
    expect(parsed.help).toContain("herdr worktree create --help")
  })
})

describe("review", () => {
  test("prints the report from the configured store and log", () => {
    createLog(join(dir, "log")).write({
      type: "replied",
      reply: "always",
      permission: "bash",
      agent: "plan",
      patterns: ["uptime"],
      always: ["uptime *"],
    })
    expect(cli("review")).toBe(0)
    expect(stdout).toContain("1. `uptime`")
  })

  test("--store and --log-dir override the environment", () => {
    writeFileSync(join(dir, "other.json"), JSON.stringify({ allow: ["id -un"] }))
    cli("review", "--store", join(dir, "other.json"))
    expect(stdout).toContain("- `id -un`")
  })

  test("validates --limit", () => {
    expect(cli("review", "--limit", "0")).toBe(EXIT.usage)
    expect(cli("review", "--limit=3")).toBe(0)
  })

  test("a corrupt store is an error, not a crash", () => {
    writeFileSync(join(dir, "store.json"), "{ nope")
    expect(cli("review")).toBe(70)
    expect(stderr).toContain("cannot parse")
  })
})

describe("install", () => {
  test("delegates to opencode plugin", () => {
    expect(cli("install", "-g", "--force")).toBe(0)
    expect(ran).toEqual([["opencode", ["plugin", "opencode-readonly-guard", "--global", "--force"]]])
  })

  test("local install by default", () => {
    cli("install")
    expect(ran).toEqual([["opencode", ["plugin", "opencode-readonly-guard"]]])
  })
})
