import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { CliIo } from "./commands.js"
import { DEFAULT_READ_ONLY_AGENTS, PLUGIN_ID, TOOL_REVIEW } from "./constants.js"
import { isEditDenied, type AgentConfig } from "./inject.js"
import { createLog, type LogEvent } from "./log.js"
import { resolveOptions } from "./options.js"
import { loadStore } from "./store.js"

/** One entry of this plugin in opencode's resolved config. */
export interface EntryReport {
  spec: string
  /** `global` or `local` (the project's config), as opencode reports it. */
  scope?: string
  /** The config file that names it. */
  source?: string
  kind: "npm" | "file"
  /** Its plugin options. */
  options?: Record<string, unknown>
  /** The file opencode imports for a path entry, when it can be found. */
  module?: string
  /** What the copy did when opencode started. */
  state: "in charge" | "failed closed" | "passive" | "failed" | "not loaded"
  /** Why it failed to start, or why opencode cannot import it. */
  error?: string
}

export interface AgentReport {
  name: string
  /** Does it carry the guard's rules (`readonly_guard_review: deny`, set on every agent the plugin protects)? */
  guarded: boolean
  /** Its bash rules as opencode will apply them, the plugin's included. */
  bash: Record<string, string>
  note?: string
}

export interface DoctorReport {
  directory: string
  /** Did the plugin start and apply its rules to at least one agent? */
  active: boolean
  /** Why the guard is not active. */
  reason?: string
  entries: EntryReport[]
  /** `file://` entries whose path does not exist: opencode skips them without a word, and they may be this plugin. */
  missing: string[]
  agents: AgentReport[]
  /** The startup event of the opencode started for this check: `init`, or the `error` of a copy that failed closed. */
  startup?: LogEvent
  /** Other errors logged during that start (store, options, ignored rules). */
  problems: LogEvent[]
  warnings: string[]
  /** The last startup recorded for this project in the log the plugin writes to, before this check. */
  logged: { logDir: string; event?: LogEvent }
}

type DoctorIo = Pick<CliIo, "cwd" | "env" | "exec">
type Spec = string | [string, Record<string, unknown>]
interface Origin {
  spec: Spec
  scope?: string
  source?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch {
    return undefined
  }
}

/** The startup event of a copy: `init`, or the `error` of one that failed closed. */
const isStartup = (event: LogEvent) =>
  event.type === "init" || (event.type === "error" && (event.where === "load" || event.where === "config"))

function realPath(url: string): string {
  const path = url.startsWith("file:") ? fileURLToPath(url) : url
  return existsSync(path) ? realpathSync(path) : path
}

/** The same file, whatever the symbolic links on the way. */
const sameFile = (a: string | undefined, b: string | undefined): boolean => !!a && !!b && realPath(a) === realPath(b)

/** The file opencode imports for a plugin directory: `exports["./server"]`, else `main`, else an `index.*` file. */
function serverEntry(dir: string): string | undefined {
  const manifest = readJson(join(dir, "package.json"))
  const pick = (value: unknown): string | undefined => {
    if (typeof value === "string") return value
    if (!isRecord(value)) return undefined
    return [value.import, value.default].find((item): item is string => typeof item === "string")
  }
  const exported = isRecord(manifest) && isRecord(manifest.exports) ? pick(manifest.exports["./server"]) : undefined
  const main = isRecord(manifest) && typeof manifest.main === "string" ? manifest.main.trim() : ""
  const target = exported ?? (main || undefined)
  if (target) return resolve(dir, target)
  return ["index.ts", "index.tsx", "index.js", "index.mjs", "index.cjs"].map((name) => join(dir, name)).find(existsSync)
}

/** The nearest package directory above a file, if it is this plugin's. */
function packageAbove(file: string): string | undefined {
  for (let dir = dirname(file), depth = 0; depth < 4 && dir !== dirname(dir); dir = dirname(dir), depth++) {
    const manifest = readJson(join(dir, "package.json"))
    if (isRecord(manifest)) return manifest.name === PLUGIN_ID ? dir : undefined
  }
  return undefined
}

/** Imports a module the way opencode does and checks that it exports a plugin definition. */
const PROBE = `const url = process.argv[2]
try {
  const plugin = (await import(url)).default
  if (plugin === null || typeof plugin !== "object" || typeof plugin.server !== "function") {
    console.log(JSON.stringify({ error: "its default export is not a plugin definition { id, server }" }))
  } else console.log(JSON.stringify({ id: plugin.id }))
} catch (error) {
  console.log(JSON.stringify({ error: String(error && error.message ? error.message : error) }))
}
`

/** Why opencode cannot import a path entry, or undefined if a child process imports it fine. */
function importError(module: string | undefined, dir: string, io: DoctorIo, scratch: string): string | undefined {
  if (!module) return 'no entry point: package.json has neither exports["./server"] nor main'
  const file = fileURLToPath(module)
  if (!existsSync(file)) {
    const fix = existsSync(join(dir, "src"))
      ? `a checkout that was not built, run \`mise run build\` in ${dir}`
      : "reinstall the plugin"
    return `${relative(dir, file)} is missing: ${fix}`
  }
  const probe = join(scratch, "probe.mjs")
  if (!existsSync(probe)) writeFileSync(probe, PROBE)
  const run = io.exec(process.execPath, [probe, module], { cwd: io.cwd, env: io.env, timeout: 60_000 })
  const answer = readAnswer(run.stdout)
  if (answer) return answer.error ? `cannot be imported: ${answer.error}` : undefined
  return `cannot be imported: ${run.error ?? (run.stderr.trim() || `exit status ${run.status}`)}`
}

function readAnswer(stdout: string): { error?: string } | undefined {
  try {
    const answer: unknown = JSON.parse(stdout.trim().split("\n").at(-1) ?? "")
    return isRecord(answer) ? { error: typeof answer.error === "string" ? answer.error : undefined } : undefined
  } catch {
    return undefined
  }
}

interface Entry extends EntryReport {
  /** The package directory of a path entry. */
  dir?: string
}

/** This plugin's entries among opencode's, and the `file://` entries that point nowhere. */
function findEntries(origins: Origin[]): { entries: Entry[]; missing: string[] } {
  const entries: Entry[] = []
  const missing: string[] = []
  for (const { spec, scope, source } of origins) {
    const [name, options] = Array.isArray(spec) ? spec : [spec, undefined]
    if (typeof name !== "string") continue
    const base = { spec: name, scope, source, options, state: "not loaded" as const }
    if (!name.startsWith("file:")) {
      if (name === PLUGIN_ID || name.startsWith(`${PLUGIN_ID}@`)) entries.push({ ...base, kind: "npm" })
      continue
    }
    const path = fileURLToPath(name)
    if (!existsSync(path)) {
      missing.push(name)
      continue
    }
    if (statSync(path).isDirectory()) {
      const manifest = readJson(join(path, "package.json"))
      if (!isRecord(manifest) || manifest.name !== PLUGIN_ID) continue
      const entry = serverEntry(path)
      entries.push({ ...base, kind: "file", dir: path, module: entry && pathToFileURL(entry).href })
    } else {
      const dir = packageAbove(path)
      if (dir) entries.push({ ...base, kind: "file", dir, module: name })
    }
  }
  return { entries, missing }
}

/** Does a loaded module (`import.meta.url` of a copy) belong to this entry? */
function loadedFrom(entry: Entry, module: unknown): boolean {
  if (typeof module !== "string") return false
  if (entry.kind === "npm") return module.includes(`/node_modules/${PLUGIN_ID}/`)
  return sameFile(entry.module, module)
}

function agentReports(config: Record<string, unknown>, excluded: ReadonlySet<string>): AgentReport[] {
  const agents = isRecord(config.agent) ? (config.agent as Record<string, AgentConfig | undefined>) : {}
  const permissionOf = (agent: AgentConfig | undefined) => (isRecord(agent?.permission) ? agent.permission : {})
  const names = new Set<string>(DEFAULT_READ_ONLY_AGENTS)
  for (const [name, agent] of Object.entries(agents)) {
    if (isEditDenied(agent) || permissionOf(agent)[TOOL_REVIEW] === "deny") names.add(name)
  }
  const reports: AgentReport[] = []
  for (const name of names) {
    const agent = agents[name]
    if (agent?.disable) continue
    const permission = permissionOf(agent)
    const raw = permission.bash
    const bash: Record<string, string> =
      typeof raw === "string" ? { "*": raw } : isRecord(raw) ? (raw as Record<string, string>) : {}
    const guarded = permission[TOOL_REVIEW] === "deny"
    const rules = Object.values(bash)
    let note: string | undefined
    if (bash["*"] === "deny") note = "bash denied by the agent"
    else if (guarded && bash["*"] === "ask" && !rules.includes("allow")) note = "asks before every command"
    else if (!guarded && excluded.has(name)) note = "excluded by the options"
    reports.push({ name, guarded, bash, note })
  }
  return reports
}

/**
 * Start opencode in the working directory the way a session does, without a model (`opencode debug config`), and
 * find out whether the guard is active there. The plugin's startup event of that run is written to a directory of
 * its own (unless the plugin options name a log directory), so the user's log is not touched and no other session
 * starting at the same time is taken for this one.
 */
export function doctor(io: DoctorIo): DoctorReport {
  const scratch = mkdtempSync(join(tmpdir(), "rg-doctor-"))
  try {
    return examine(io, scratch)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

function examine(io: DoctorIo, scratch: string): DoctorReport {
  const directory = io.cwd
  const started = new Date().toISOString()
  const logDir = join(scratch, "log")
  const run = io.exec("opencode", ["debug", "config"], {
    cwd: directory,
    env: { ...io.env, PWD: directory, READONLY_GUARD_DATA: logDir },
    timeout: 180_000,
  })
  const fail = (reason: string): DoctorReport => ({
    directory,
    active: false,
    reason,
    entries: [],
    missing: [],
    agents: [],
    problems: [],
    warnings: [],
    logged: lastLogged(io, undefined, directory, started),
  })
  if (run.error && run.status === null) return fail(`cannot run opencode: ${run.error}`)
  if (run.status !== 0) {
    const detail = run.stderr.trim().split("\n")[0] ?? ""
    return fail(`opencode debug config failed (exit status ${run.status}): ${detail}`)
  }
  let config: unknown
  try {
    config = JSON.parse(run.stdout)
  } catch {
    return fail("opencode debug config did not print a configuration")
  }
  if (!isRecord(config)) return fail("opencode debug config did not print a configuration")

  const origins: Origin[] = Array.isArray(config.plugin_origins)
    ? (config.plugin_origins as Origin[])
    : Array.isArray(config.plugin)
      ? (config.plugin as Spec[]).map((spec) => ({ spec }))
      : []
  const { entries, missing } = findEntries(origins)

  // the start of this check: in its own log directory, or after `started` in a directory named by the options
  const dirs = new Set(entries.flatMap(({ options }) => (typeof options?.logDir === "string" ? [options.logDir] : [])))
  const events = [
    ...createLog(logDir).read(),
    ...[...dirs].flatMap((dir) =>
      createLog(dir)
        .read()
        .filter((event) => event.ts >= started),
    ),
  ]
  const startups = events.filter(isStartup)
  const startup = startups.at(-1)
  const problems = events.filter((event) => event.type === "error" && !isStartup(event))
  const warnings: string[] = []
  if (startups.length > 1) {
    warnings.push(`${startups.length} copies logged a startup: a copy built before copies agreed on one runs as well`)
  }

  const copies = Array.isArray(startup?.copies) ? (startup.copies as unknown[]) : []
  const failed = Array.isArray(startup?.failed) ? (startup.failed as { module?: unknown; error?: unknown }[]) : []
  for (const entry of entries) {
    const failure = failed.find((copy) => loadedFrom(entry, copy.module))
    if (loadedFrom(entry, startup?.module)) entry.state = startup?.type === "init" ? "in charge" : "failed closed"
    else if (failure) {
      entry.state = "failed"
      entry.error = String(failure.error)
    } else if (copies.some((module) => loadedFrom(entry, module))) entry.state = "passive"
    else if (entry.dir) entry.error = importError(entry.module, entry.dir, io, scratch)
  }
  for (const entry of entries) {
    if (entry.state === "failed") warnings.push(`${entry.spec} failed to start (${entry.error}); another copy guards`)
    if (entry.state === "not loaded" && startup)
      warnings.push(`${entry.spec} was not loaded${entry.error ? `: ${entry.error}` : ""}`)
  }
  for (const spec of missing) warnings.push(`${spec} does not exist: opencode skips it without a word`)

  const inCharge = entries.find((entry) => entry.state === "in charge" || entry.state === "failed closed")
  const options = resolveOptions(inCharge?.options ?? entries[0]?.options ?? {}, io.env)
  const store = loadStore(options.storeFile, () => undefined)
  const agents = agentReports(config, new Set([...options.excludeAgents, ...store.agents.exclude]))
  const guarded = agents.filter((agent) => agent.guarded)

  let reason: string | undefined
  if (startup && startup.type !== "init") {
    const guard = startup.writeGuard === false ? ", and the write guard is off" : ""
    reason = `the guard failed closed (${String(startup.where)}): ${String(startup.error)}. Read-only agents ask before every command${guard}`
  } else if (!startup && !guarded.length) {
    if (!entries.length) reason = "the plugin is not configured for this directory"
    else {
      const why = entries.flatMap((entry) => (entry.error ? [entry.error] : []))
      reason = `no copy of the plugin started${why.length ? `: ${why.join("; ")}` : ""}`
    }
  } else if (!guarded.length) reason = "no agent carries the guard's rules"
  if (!reason && !startup) warnings.push("agents carry the guard's rules, but no startup was logged")
  for (const agent of agents) {
    if (!reason && !agent.guarded && !agent.note) warnings.push(`${agent.name} is read-only but NOT guarded`)
  }

  return {
    directory,
    active: !reason,
    reason,
    entries: entries.map((entry): EntryReport => {
      const { dir, ...report } = entry
      void dir // only used to find the module
      return report
    }),
    missing,
    agents,
    startup,
    problems,
    warnings,
    logged: lastLogged(io, inCharge?.options ?? entries[0]?.options, String(startup?.project ?? directory), started),
  }
}

/** The last startup recorded for a project before `before`, in the log the plugin writes to. */
function lastLogged(
  io: DoctorIo,
  options: Record<string, unknown> | undefined,
  project: string,
  before: string,
): DoctorReport["logged"] {
  const { logDir } = resolveOptions(options ?? {}, io.env)
  const event = createLog(logDir)
    .read()
    .filter((item) => isStartup(item) && item.project === project && item.ts < before)
    .at(-1)
  return { logDir, event }
}

const count = (bash: Record<string, string>, action: string) => Object.values(bash).filter((a) => a === action).length

function describeStartup(event: LogEvent): string {
  if (event.type === "init") {
    const agents = Array.isArray(event.roAgents) ? event.roAgents.join(", ") : "?"
    const presets = Array.isArray(event.presets) && event.presets.length ? `, presets: ${event.presets.join(", ")}` : ""
    return `${event.ts} started: read-only agents ${agents}, ${String(event.learned ?? 0)} learned rules${presets}`
  }
  const guard = event.writeGuard === false ? " (write guard off)" : ""
  return `${event.ts} failed closed (${String(event.where)})${guard}: ${String(event.error)}`
}

/** The report as text. */
export function formatReport(report: DoctorReport): string {
  const lines = [`Directory: ${report.directory}`, "", "Plugin entries"]
  if (!report.entries.length) lines.push("  none")
  for (const entry of report.entries) {
    const state =
      entry.kind === "npm" && entry.state === "not loaded" ? "not loaded (npm package, not checked)" : entry.state
    lines.push(
      `  ${(entry.scope ?? "").padEnd(6)} ${entry.spec}`,
      `         ${state}${entry.error ? `: ${entry.error}` : ""}`,
    )
  }
  if (report.agents.length) lines.push("", "Read-only agents")
  for (const agent of report.agents) {
    const rules = Object.keys(agent.bash).length
    const detail = agent.note
      ? agent.note
      : `${rules} bash rules (${count(agent.bash, "allow")} allow, ${count(agent.bash, "ask")} ask, ${count(agent.bash, "deny")} deny)`
    lines.push(
      `  ${agent.name.padEnd(10)} ${agent.guarded ? `guarded: ${detail}` : `NOT guarded${agent.note ? `: ${agent.note}` : ""}`}`,
    )
  }
  if (report.startup || report.problems.length) lines.push("", "This start (opencode debug config)")
  if (report.startup) lines.push(`  ${describeStartup(report.startup)}`)
  for (const problem of report.problems) {
    lines.push(
      `  error (${String(problem.where)}): ${String(problem.error)}${problem.pattern ? ` [${String(problem.pattern)}]` : ""}`,
    )
  }
  const project = report.startup?.project ?? report.directory
  lines.push("", `Last start logged for ${String(project)} (${report.logged.logDir})`)
  lines.push(`  ${report.logged.event ? describeStartup(report.logged.event) : "none"}`)
  if (report.warnings.length) lines.push("", "Warnings", ...report.warnings.map((warning) => `  ${warning}`))
  lines.push("", report.active ? "Guard active." : `Guard NOT active: ${report.reason}.`, "")
  return lines.join("\n")
}
