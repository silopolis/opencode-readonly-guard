import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createLog, type LogEvent } from "../src/log.js"

export const repoRoot = fileURLToPath(new URL("..", import.meta.url))
/** How opencode refers to this repository as a plugin. */
export const pluginUrl = pathToFileURL(repoRoot).href

export const hasOpencode = spawnSync("opencode", ["--version"], { stdio: "ignore" }).status === 0

export interface Run {
  status: number | null
  stdout: string
  stderr: string
}

export interface Sandbox {
  /** Everything lives under this directory. */
  dir: string
  /** The project opencode runs in (a fresh git repository). */
  project: string
  /** Where learned rules are stored. */
  store: string
  env: NodeJS.ProcessEnv
  /** Events written by the plugin. */
  events(): LogEvent[]
  /** Write a file relative to the project. */
  write(path: string, content: string): void
  /** Pre-fill the learned-rules file. */
  writeStore(data: unknown): void
  /** Run opencode in the project with the sandbox environment. */
  opencode(args: string[], timeout?: number): Run
  cleanup(): void
}

export interface SandboxOptions {
  /** Plugin spec for the project config. Default: this repository (its built `dist/`). */
  plugin?: string | [string, Record<string, unknown>]
  /** Use the real opencode home (credentials, models) instead of an empty one. Needed for e2e tests only. */
  realHome?: boolean
}

/** The package must be built first: opencode loads `dist/`. */
export function requireBuild(): void {
  if (!existsSync(join(repoRoot, "dist", "index.js"))) throw new Error("dist/ is missing: run `mise run build` first")
}

/** A throwaway project with the plugin configured, and an environment that keeps opencode away from the user's. */
export function sandbox({ plugin = pluginUrl, realHome = false }: SandboxOptions = {}): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), "rg-sandbox-"))
  const project = join(dir, "project")
  const store = join(dir, "store.json")
  const logDir = join(dir, "log")
  mkdirSync(project, { recursive: true })
  // PWD must follow the working directory: opencode trusts it over the real cwd.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PWD: project,
    READONLY_GUARD_STORE: store,
    READONLY_GUARD_DATA: logDir,
  }
  if (!realHome) {
    for (const [name, sub] of [
      ["XDG_CONFIG_HOME", "config"],
      ["XDG_DATA_HOME", "data"],
      ["XDG_CACHE_HOME", "cache"],
      ["XDG_STATE_HOME", "state"],
    ] as const) {
      env[name] = join(dir, "xdg", sub)
    }
  }
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(project, path)), { recursive: true })
    writeFileSync(join(project, path), content)
  }
  // opencode needs a repository with a commit to track the project's state.
  spawnSync("git", ["init", "-q"], { cwd: project })
  spawnSync(
    "git",
    ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "--allow-empty", "-m", "init"],
    {
      cwd: project,
    },
  )
  write(
    "opencode.json",
    `${JSON.stringify({ $schema: "https://opencode.ai/config.json", plugin: [plugin] }, null, 2)}\n`,
  )
  return {
    dir,
    project,
    store,
    env,
    events: () => createLog(logDir).read(),
    write,
    writeStore: (data) => writeFileSync(store, JSON.stringify(data)),
    opencode: (args, timeout = 120_000) => {
      const result = spawnSync("opencode", args, {
        cwd: project,
        env,
        encoding: "utf8",
        timeout,
        stdio: ["ignore", "pipe", "pipe"],
      })
      return { status: result.status, stdout: result.stdout, stderr: result.stderr }
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

interface Rule {
  permission: string
  pattern: string
  action: string
}

/** The resolved permission rules of an agent, as `opencode debug agent <name>` prints them. */
export function agentRules(box: Sandbox, agent: string): Rule[] {
  const run = box.opencode(["debug", "agent", agent])
  if (run.status !== 0) throw new Error(`opencode debug agent ${agent} failed: ${run.stderr || run.stdout}`)
  return (JSON.parse(run.stdout) as { permission: Rule[] }).permission
}
