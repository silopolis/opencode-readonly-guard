import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { runCli, type CliIo, type ExecOptions, type ExecResult } from "../../src/commands.js"
import type { DoctorReport } from "../../src/doctor.js"
import { createLog, type LogEvent } from "../../src/log.js"

let dir: string
let project: string
let stdout: string
let stderr: string
let calls: { command: string; args: string[]; options: ExecOptions }[]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rg-doctor-test-"))
  project = join(dir, "project")
  mkdirSync(project)
  stdout = ""
  stderr = ""
  calls = []
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** A checkout of the plugin: `package.json`, `src/`, and `dist/index.js` once built. */
function checkout(
  name: string,
  built: string | false = "export default { id: 'opencode-readonly-guard', server: async () => ({}) }\n",
) {
  const root = join(dir, name)
  mkdirSync(join(root, "src"), { recursive: true })
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "opencode-readonly-guard", exports: { "./server": { import: "./dist/index.js" } } }),
  )
  writeFileSync(join(root, "src", "index.ts"), "")
  if (built !== false) {
    mkdirSync(join(root, "dist"))
    writeFileSync(join(root, "dist", "index.js"), built)
  }
  return { root, spec: pathToFileURL(root).href, module: pathToFileURL(join(root, "dist", "index.js")).href }
}

type Spec = string | [string, Record<string, unknown>]
const origin = (spec: Spec, scope = "local") => ({ spec, scope, source: join(project, "opencode.json") })

/** What `opencode debug config` prints once the plugin's config hook ran: plan and explore with the guard's rules. */
function guardedConfig(origins: ReturnType<typeof origin>[], agents: Record<string, unknown> = {}) {
  const policy = {
    bash: { "*": "ask", "git log*": "allow", "ls *": "allow", "*-delete*": "ask" },
    readonly_guard_review: "deny",
    readonly_guard_update: "deny",
  }
  return {
    plugin: origins.map((item) => item.spec),
    plugin_origins: origins,
    agent: { plan: { permission: policy }, explore: { permission: policy }, ...agents },
  }
}

interface Fake {
  config?: unknown
  /** Events the plugin writes while opencode starts. */
  events?: Omit<LogEvent, "ts">[]
  /** Where the plugin writes them, when its options name a log directory. Default: READONLY_GUARD_DATA. */
  logDir?: string
  status?: number
  stderr?: string
  missing?: boolean
}

function io(fake: Fake, env: NodeJS.ProcessEnv = {}): CliIo {
  return {
    out: (text) => void (stdout += text),
    err: (text) => void (stderr += text),
    cwd: project,
    env: {
      READONLY_GUARD_STORE: join(dir, "store.json"),
      READONLY_GUARD_DATA: join(dir, "log"),
      ...env,
    },
    run: () => 0,
    exec: (command, args, options): ExecResult => {
      calls.push({ command, args, options })
      if (command !== "opencode") {
        // the import check: run it for real
        const result = spawnSync(command, args, { ...options, encoding: "utf8" })
        return { status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message }
      }
      if (fake.missing) return { status: null, stdout: "", stderr: "", error: "spawnSync opencode ENOENT" }
      if (fake.status) return { status: fake.status, stdout: "", stderr: fake.stderr ?? "" }
      const log = createLog(fake.logDir ?? options.env.READONLY_GUARD_DATA!)
      for (const event of fake.events ?? []) log.write(event)
      return { status: 0, stdout: JSON.stringify(fake.config ?? { plugin: [], plugin_origins: [] }), stderr: "" }
    },
  }
}

const doctor = (fake: Fake, ...args: string[]) => runCli(["doctor", ...args], io(fake))
const report = (fake: Fake): DoctorReport => {
  runCli(["doctor", "--json"], io(fake))
  return JSON.parse(stdout) as DoctorReport
}
const init = (module: string, extra: Record<string, unknown> = {}) => ({
  type: "init",
  project,
  roAgents: ["plan", "explore"],
  learned: 0,
  presets: [],
  module,
  copies: [module],
  failed: [],
  ...extra,
})

describe("doctor", () => {
  test("active: the copy in charge and the guarded agents, exit status 0", () => {
    const copy = checkout("checkout")
    expect(doctor({ config: guardedConfig([origin(copy.spec)]), events: [init(copy.module)] })).toBe(0)
    expect(stdout).toContain(copy.spec)
    expect(stdout).toContain("in charge")
    expect(stdout).toMatch(/plan\s+guarded: 4 bash rules \(2 allow, 2 ask, 0 deny\)/)
    expect(stdout).toContain("Guard active")
    expect(stderr).toBe("")
  })

  test("runs opencode in the current directory, logging to a directory of its own that it removes", () => {
    const copy = checkout("checkout")
    doctor({ config: guardedConfig([origin(copy.spec)]), events: [init(copy.module)] })
    const [run] = calls
    expect(run).toMatchObject({ command: "opencode", args: ["debug", "config"], options: { cwd: project } })
    expect(run.options.env.PWD).toBe(project)
    const scratch = run.options.env.READONLY_GUARD_DATA!
    expect(scratch).not.toBe(join(dir, "log"))
    expect(existsSync(scratch)).toBe(false)
    // the user's log is left alone
    expect(createLog(join(dir, "log")).read()).toEqual([])
  })

  test("not configured: exit status 1", () => {
    expect(doctor({ config: { plugin: ["file:///elsewhere/other-plugin"], plugin_origins: [] } })).toBe(1)
    expect(stdout).toContain("Guard NOT active: the plugin is not configured for this directory")
  })

  test("a checkout without dist/: exit status 1, with the reason and the fix", () => {
    const copy = checkout("unbuilt", false)
    expect(doctor({ config: { plugin_origins: [origin(copy.spec, "global")] } })).toBe(1)
    expect(stdout).toContain("not loaded: dist/index.js is missing")
    expect(stdout).toContain(`run \`mise run build\` in ${copy.root}`)
    expect(stdout).toMatch(/plan\s+NOT guarded/)
    expect(stdout).toContain("Guard NOT active: no copy of the plugin started")
  })

  test("a copy that cannot be imported, or does not export a plugin, says why", () => {
    const throwing = checkout("throwing", "throw new Error('boom at import')\n")
    const wrong = checkout("wrong", "export default 42\n")
    const result = report({ config: { plugin_origins: [origin(throwing.spec), origin(wrong.spec)] } })
    expect(result.entries.map((entry) => [entry.state, entry.error])).toEqual([
      ["not loaded", expect.stringContaining("boom at import")],
      ["not loaded", expect.stringContaining("default export is not a plugin")],
    ])
  })

  test("a copy that failed closed: exit status 1, and whether the write guard is off", () => {
    const copy = checkout("checkout")
    const config = guardedConfig([origin(copy.spec)], {
      plan: { permission: { bash: { "*": "ask" }, readonly_guard_review: "deny" } },
    })
    const events = [
      {
        type: "error",
        where: "load",
        error: "readonly-guard: cannot load commands.json: JSON Parse error",
        writeGuard: false,
        project,
        module: copy.module,
      },
    ]
    expect(doctor({ config, events })).toBe(1)
    expect(stdout).toContain("failed closed")
    expect(stdout).toContain("cannot load commands.json")
    expect(stdout).toContain("the write guard is off")
    expect(stdout).toMatch(/plan\s+guarded: asks before every command/)
  })

  test("a broken copy behind a working one: active, with a warning", () => {
    const global = checkout("global")
    const local = checkout("local")
    const failed = [{ module: global.module, error: "readonly-guard: cannot load allow.json" }]
    const result = report({
      config: guardedConfig([origin(global.spec, "global"), origin(local.spec)]),
      events: [init(local.module, { failed })],
    })
    expect(result.active).toBe(true)
    expect(result.entries.map((entry) => [entry.scope, entry.state, entry.error])).toEqual([
      ["global", "failed", "readonly-guard: cannot load allow.json"],
      ["local", "in charge", undefined],
    ])
    expect(result.warnings).toContainEqual(expect.stringContaining("failed to start"))
  })

  test("a passive copy and an npm entry", () => {
    const global = checkout("global")
    const local = checkout("local")
    const result = report({
      config: guardedConfig([
        origin(global.spec, "global"),
        origin(local.spec),
        origin("opencode-readonly-guard@0.1.0"),
      ]),
      events: [init(local.module, { copies: [global.module, local.module] })],
    })
    expect(result.entries.map((entry) => [entry.kind, entry.state])).toEqual([
      ["file", "passive"],
      ["file", "in charge"],
      ["npm", "not loaded"],
    ])
  })

  test("opencode missing or failing: exit status 1", () => {
    expect(doctor({ missing: true })).toBe(1)
    expect(stdout).toContain("Guard NOT active: cannot run opencode: spawnSync opencode ENOENT")
    stdout = ""
    expect(doctor({ status: 1, stderr: "Error: invalid config\nat line 3" })).toBe(1)
    expect(stdout).toContain("opencode debug config failed (exit status 1): Error: invalid config")
  })

  test("a log directory set in the options wins: the start is found there, not older ones", () => {
    const copy = checkout("checkout")
    const logDir = join(dir, "custom-log")
    mkdirSync(logDir)
    const old = { ts: "2026-01-01T00:00:00.000Z", ...init(copy.module), roAgents: ["old"] }
    writeFileSync(join(logDir, "events.jsonl"), `${JSON.stringify(old)}\n`)
    const result = report({
      config: guardedConfig([origin([copy.spec, { logDir }])]),
      events: [init(copy.module)],
      logDir,
    })
    expect(result.active).toBe(true)
    expect(result.startup).toMatchObject({ type: "init", roAgents: ["plan", "explore"] })
    expect(result.logged.event).toMatchObject({ roAgents: ["old"] })
  })

  test("the last start recorded for the project in the user's log", () => {
    const copy = checkout("checkout")
    const earlier = [
      { ts: "2026-01-01T00:00:00.000Z", type: "error", where: "load", error: "earlier failure", project },
      { ts: "2026-01-02T00:00:00.000Z", ...init(copy.module), project: "/another/project" },
    ]
    mkdirSync(join(dir, "log"))
    writeFileSync(join(dir, "log", "events.jsonl"), earlier.map((event) => `${JSON.stringify(event)}\n`).join(""))
    expect(doctor({ config: guardedConfig([origin(copy.spec)]), events: [init(copy.module)] })).toBe(0)
    expect(stdout).toContain(`Last start logged for ${project}`)
    expect(stdout).toContain("earlier failure")
  })

  test("agents: denied bash, an unguarded read-only agent, an excluded one", () => {
    const copy = checkout("checkout")
    const config = guardedConfig([origin([copy.spec, { agents: { exclude: ["explore"] } }])], {
      explore: { permission: {} },
      auditor: { permission: { edit: "deny", bash: { "*": "deny" }, readonly_guard_review: "deny" } },
      reviewer: { permission: { edit: "deny" } },
      build: { permission: { bash: "allow" } },
    })
    const result = report({ config, events: [init(copy.module)] })
    expect(result.agents.map((agent) => [agent.name, agent.guarded, agent.note])).toEqual([
      ["plan", true, undefined],
      ["explore", false, "excluded by the options"],
      ["auditor", true, "bash denied by the agent"],
      ["reviewer", false, undefined],
    ])
    expect(result.active).toBe(true)
    expect(result.warnings).toContainEqual(expect.stringContaining("reviewer"))
    expect(result.agents[0].bash).toMatchObject({ "git log*": "allow" })
  })

  test("a file:// entry that does not exist is reported", () => {
    const copy = checkout("checkout")
    const missing = pathToFileURL(join(dir, "moved-away")).href
    const result = report({ config: guardedConfig([origin(missing), origin(copy.spec)]), events: [init(copy.module)] })
    expect(result.missing).toEqual([missing])
    expect(result.warnings).toContainEqual(expect.stringContaining("does not exist"))
  })

  test("rejects unknown arguments", () => {
    expect(doctor({}, "--bogus")).toBe(64)
    expect(stderr).toContain("doctor: unexpected argument --bogus")
    expect(calls).toEqual([])
  })
})
