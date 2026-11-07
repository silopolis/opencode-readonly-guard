import { spawn, spawnSync } from "node:child_process"
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createLog, type LogEvent } from "../src/log.js"

export const repoRoot = fileURLToPath(new URL("..", import.meta.url))
/** How opencode refers to this repository as a plugin. */
export const pluginUrl = pathToFileURL(repoRoot).href

/**
 * The environment for the processes the tests start: the caller's, without the variables that tie a child to where
 * the suite runs.
 * - `GIT_*`: in a git hook (the pre-push hook runs the unit tests), git exports GIT_DIR and hk adds GIT_WORK_TREE.
 *   Inherited, they take a `git init` or `git commit` in a temporary directory to the caller's repository: from a
 *   linked worktree, that wrote core.bare or core.worktree into the shared config and committed on its branch.
 * - `HERDR_*`: the suite may run from a herdr pane, and whether opencode sees herdr must not depend on that.
 */
export function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of Object.keys(env)) if (name.startsWith("GIT_") || name.startsWith("HERDR_")) delete env[name]
  return env
}

export const hasOpencode = spawnSync("opencode", ["--version"], { stdio: "ignore", env: childEnv() }).status === 0

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
  /** The environment of every process the sandbox starts: `childEnv()` plus the sandbox's own paths. */
  env: NodeJS.ProcessEnv
  /** Events written by the plugin. */
  events(): LogEvent[]
  /** Write a file relative to the project. */
  write(path: string, content: string): void
  /** Pre-fill the learned-rules file. */
  writeStore(data: unknown): void
  /** Pre-fill the rules file in herdr's config directory (only read when the sandbox runs `herdr: true`). */
  writeHerdrFile(data: unknown): void
  /** Run opencode in the project with the sandbox environment. */
  opencode(args: string[], timeout?: number): Run
  cleanup(): void
}

type PluginSpec = string | [string, Record<string, unknown>]

export interface SandboxOptions {
  /** Plugin spec for the project config. Default: this repository (its built `dist/`). */
  plugin?: PluginSpec
  /** Plugin spec for the sandbox's global config (`$XDG_CONFIG_HOME/opencode/opencode.json`). Default: none. */
  globalPlugin?: PluginSpec
  /** Use the real opencode home (credentials, models) instead of an empty one. Needed for e2e tests only. */
  realHome?: boolean
  /** Run opencode as if started from a herdr pane (`HERDR_ENV=1`). Default: never, whatever the caller's environment. */
  herdr?: boolean
}

/** The package must be built first: opencode loads `dist/`. */
export function requireBuild(): void {
  if (!existsSync(join(repoRoot, "dist", "index.js"))) throw new Error("dist/ is missing: run `mise run build` first")
}

const configWith = (spec: PluginSpec) =>
  `${JSON.stringify({ $schema: "https://opencode.ai/config.json", plugin: [spec] }, null, 2)}\n`

/**
 * Copy the built plugin (`dist/`, `rules/`, `package.json`, no `node_modules`) to `target` and return its spec, so
 * that opencode can load a second copy from another path.
 */
export function copyPlugin(target: string): string {
  requireBuild()
  for (const name of ["dist", "rules", "package.json"])
    cpSync(join(repoRoot, name), join(target, name), { recursive: true })
  return pathToFileURL(target).href
}

/** A throwaway project with the plugin configured, and an environment that keeps opencode away from the user's. */
export function sandbox({
  plugin = pluginUrl,
  globalPlugin,
  realHome = false,
  herdr = false,
}: SandboxOptions = {}): Sandbox {
  // the real home's config is the user's: never write to it
  if (globalPlugin && realHome) throw new Error("sandbox: globalPlugin needs the sandbox's own config directory")
  const dir = mkdtempSync(join(tmpdir(), "rg-sandbox-"))
  const project = join(dir, "project")
  const store = join(dir, "store.json")
  const logDir = join(dir, "log")
  mkdirSync(project, { recursive: true })
  // PWD must follow the working directory: opencode trusts it over the real cwd.
  const env: NodeJS.ProcessEnv = {
    ...childEnv(),
    PWD: project,
    READONLY_GUARD_STORE: store,
    READONLY_GUARD_DATA: logDir,
  }
  const herdrDir = join(dir, "herdr")
  if (herdr) {
    env.HERDR_ENV = "1"
    env.HERDR_CONFIG_PATH = join(herdrDir, "config.toml") // never the real ~/.config/herdr
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
  let runs = 0
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(project, path)), { recursive: true })
    writeFileSync(join(project, path), content)
  }
  // opencode needs a repository with a commit to track the project's state. `env`, not the inherited environment:
  // it holds no GIT_* variable, so git acts on the project and nothing else.
  spawnSync("git", ["init", "-q"], { cwd: project, env })
  spawnSync(
    "git",
    ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "--allow-empty", "-m", "init"],
    { cwd: project, env },
  )
  write("opencode.json", configWith(plugin))
  if (globalPlugin) {
    const global = join(env.XDG_CONFIG_HOME!, "opencode")
    mkdirSync(global, { recursive: true })
    writeFileSync(join(global, "opencode.json"), configWith(globalPlugin))
  }
  return {
    dir,
    project,
    store,
    env,
    events: () => createLog(logDir).read(),
    write,
    writeStore: (data) => writeFileSync(store, JSON.stringify(data)),
    writeHerdrFile: (data) => {
      mkdirSync(herdrDir, { recursive: true })
      writeFileSync(join(herdrDir, "readonly-guard.json"), JSON.stringify(data))
    },
    opencode: (args, timeout = 120_000) => {
      // stdout to a file: opencode (Bun) loses the end of a large output written to a pipe just before it exits
      const file = join(dir, `stdout-${++runs}`)
      const fd = openSync(file, "w")
      try {
        const result = spawnSync("opencode", args, {
          cwd: project,
          env,
          encoding: "utf8",
          timeout,
          stdio: ["ignore", fd, "pipe"],
        })
        return { status: result.status, stdout: readFileSync(file, "utf8"), stderr: result.stderr }
      } finally {
        closeSync(fd)
        rmSync(file, { force: true })
      }
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

interface Rule {
  permission: string
  pattern: string
  action: string
}

/**
 * The ids of the tools opencode registers, one per registration (duplicates included): `opencode serve` in the
 * project, then `GET /experimental/tool/ids`. No debug command lists them; `debug agent` merges duplicates.
 */
export async function registeredToolIds(box: Sandbox, timeout = 120_000): Promise<string[]> {
  // port 0: opencode takes its default port if it is free, another one otherwise, and prints the address
  const child = spawn("opencode", ["serve", "--port", "0", "--hostname", "127.0.0.1"], {
    cwd: box.project,
    env: box.env,
    stdio: ["ignore", "pipe", "pipe"],
  })
  const timer = setTimeout(() => child.kill("SIGKILL"), timeout)
  try {
    let output = ""
    const url = await new Promise<string>((resolve, reject) => {
      const read = (chunk: Buffer) => {
        output += chunk.toString()
        const address = /listening on (http:\/\/\S+)/.exec(output)?.[1]
        if (address) resolve(address)
      }
      child.stdout.on("data", read)
      child.stderr.on("data", read)
      child.on("exit", (status) => reject(new Error(`opencode serve exited (${status}): ${output}`)))
    })
    const response = await fetch(`${url}/experimental/tool/ids`, { headers: { "x-opencode-directory": box.project } })
    if (!response.ok) throw new Error(`GET /experimental/tool/ids: ${response.status} ${await response.text()}`)
    return (await response.json()) as string[]
  } finally {
    clearTimeout(timer)
    child.kill("SIGTERM")
  }
}

/** The resolved permission rules of an agent, as `opencode debug agent <name>` prints them. */
export function agentRules(box: Sandbox, agent: string): Rule[] {
  const run = box.opencode(["debug", "agent", agent])
  if (run.status !== 0) throw new Error(`opencode debug agent ${agent} failed: ${run.stderr || run.stdout}`)
  return (JSON.parse(run.stdout) as { permission: Rule[] }).permission
}
