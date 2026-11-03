import type { PluginInput, PluginModule } from "@opencode-ai/plugin"
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { isBuiltin } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { childEnv, hasOpencode, repoRoot, requireBuild, sandbox } from "../helpers.js"

setDefaultTimeout(300_000)

let work: string
let tarball: string
let installed: string
/** The tarball unpacked as is: no `node_modules` in it or above it, like a checkout that was never installed. */
let unpacked: string
let files: string[]

// npm may run git, and `npm install` runs in a temporary directory: no inherited GIT_DIR may point it elsewhere.
const sh = (command: string, args: string[], cwd: string) => {
  const result = spawnSync(command, args, { cwd, env: childEnv(), encoding: "utf8" })
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}${result.stdout}`)
  return result.stdout
}

beforeAll(() => {
  requireBuild()
  work = mkdtempSync(join(tmpdir(), "rg-pack-"))
  const packed = JSON.parse(
    sh("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", work], repoRoot),
  ) as { filename: string; files: { path: string }[] }[]
  tarball = join(work, packed[0].filename)
  files = packed[0].files.map((file) => file.path)
  const app = join(work, "app")
  mkdirSync(app)
  writeFileSync(join(app, "package.json"), '{ "name": "app", "private": true }\n')
  sh("npm", ["install", "--no-audit", "--no-fund", tarball], app)
  installed = join(app, "node_modules", "opencode-readonly-guard")
  const bare = join(work, "bare")
  mkdirSync(bare)
  sh("tar", ["-xzf", tarball, "-C", bare], work)
  unpacked = join(bare, "package")
})

/** The modules a built file imports: `import … from "x"`, `import "x"`, `export … from "x"` and `import("x")`. */
function importedModules(file: string): string[] {
  const found: string[] = []
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const statement =
      /^(?:import|export)\b[^"']*?\bfrom\s*["']([^"']+)["']/.exec(line) ?? /^import\s*["']([^"']+)["']/.exec(line)
    if (statement) found.push(statement[1])
    for (const dynamic of line.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) found.push(dynamic[1])
  }
  return found
}
afterAll(() => rmSync(work, { recursive: true, force: true }))

describe("npm package", () => {
  test("ships the build, the shared rules and the licence, and nothing else", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "dist/index.js",
        "dist/index.d.ts",
        "dist/cli.js",
        "dist/zod.LICENSE", // zod is bundled into dist/index.js
        "rules/allow.json",
        "rules/cases.json",
        "LICENSE",
        "package.json",
      ]),
    )
    expect(files.filter((file) => /^(src|test)\//.test(file) || file === "hk.pkl" || file === "mise.toml")).toEqual([])
  })

  test("declares the opencode entrypoint, the bin and its compatibility range", () => {
    const manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8")) as Record<string, unknown>
    expect(manifest.exports).toMatchObject({ "./server": { import: "./dist/index.js" } })
    expect(manifest.bin).toEqual({ "opencode-readonly-guard": "./dist/cli.js" })
    expect(manifest.engines).toMatchObject({ opencode: ">=1.18.29 <2" })
    expect(manifest.peerDependencies).toMatchObject({ "@opencode-ai/plugin": ">=1.18.29 <2" })
  })

  test("the installed module exports only a default plugin definition", async () => {
    const module = (await import(join(installed, "dist", "index.js"))) as { default: { id: string; server: unknown } }
    expect(Object.keys(module)).toEqual(["default"])
    expect(module.default.id).toBe("opencode-readonly-guard")
    expect(typeof module.default.server).toBe("function")
  })

  test("the installed command-line tool works", () => {
    const bin = join(installed, "..", ".bin", "opencode-readonly-guard")
    const blocked = spawnSync(bin, ["check", "--no-store", "ls > f"], { encoding: "utf8" })
    expect(blocked.status).toBe(2)
    expect(blocked.stdout).toContain("block")
    expect(spawnSync(bin, ["--version"], { encoding: "utf8" }).stdout.trim()).toBe(
      (JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { version: string }).version,
    )
    expect(spawnSync(bin, ["rules"], { encoding: "utf8" }).stdout).toContain("git log*")
  })

  test.skipIf(!hasOpencode)("opencode loads the installed package", () => {
    const box = sandbox({ plugin: pathToFileURL(installed).href })
    try {
      const run = box.opencode(["debug", "agent", "plan"])
      expect(run.status).toBe(0)
      const rules = (JSON.parse(run.stdout) as { permission: { permission: string; pattern: string }[] }).permission
      expect(rules.some((rule) => rule.permission === "bash" && rule.pattern === "git log*")).toBe(true)
      expect(box.events().some((event) => event.type === "init")).toBe(true)
    } finally {
      box.cleanup()
    }
  })
})

// Loaded from a path (`file:///path/to/checkout`), the plugin resolves its imports from that path. opencode drops a
// plugin that fails to import without a message, so a checkout without `node_modules` used to lose the guard.
describe("without node_modules", () => {
  test("the built files import nothing but Node built-ins and each other", () => {
    const built = files.filter((file) => file.startsWith("dist/") && file.endsWith(".js"))
    expect(built).toEqual(expect.arrayContaining(["dist/index.js", "dist/cli.js"]))
    const external = built.flatMap((file) =>
      importedModules(join(unpacked, file))
        .filter((name) => !name.startsWith(".") && !isBuiltin(name))
        .map((name) => `${file}: ${name}`),
    )
    expect(external).toEqual([])
  })

  test("the unpacked module loads, and the review tools keep their argument schemas", async () => {
    const module = (await import(join(unpacked, "dist", "index.js"))) as { default: PluginModule }
    const probe = join(work, "probe")
    const hooks = await module.default.server({ client: {}, worktree: probe } as unknown as PluginInput, {
      store: join(probe, "store.json"),
      logDir: join(probe, "log"),
    })
    const limit = hooks.tool?.readonly_guard_review?.args.limit as
      | { _zod: unknown; isOptional(): boolean; description?: string }
      | undefined
    // zod schemas, as opencode expects: it converts them to JSON Schema and validates the arguments with them
    expect(limit !== undefined && "_zod" in limit).toBe(true)
    expect(limit?.isOptional()).toBe(true)
    expect(limit?.description).toBe("max candidates to list (default 10)")
    expect(Object.keys(hooks.tool?.readonly_guard_update?.args ?? {})).toEqual(["action", "value"])
  })

  test.skipIf(!hasOpencode)("opencode loads the unpacked package and applies the rules", () => {
    for (let dir = unpacked; dir !== dirname(dir); dir = dirname(dir)) {
      for (const name of ["@opencode-ai/plugin", "zod"]) expect(existsSync(join(dir, "node_modules", name))).toBe(false)
    }
    const box = sandbox({ plugin: pathToFileURL(unpacked).href })
    try {
      const run = box.opencode(["debug", "agent", "plan"])
      expect(run.status).toBe(0)
      const agent = JSON.parse(run.stdout) as {
        permission: { permission: string; pattern: string; action: string }[]
        tools: Record<string, boolean>
      }
      expect(agent.permission).toContainEqual({ permission: "bash", pattern: "git log*", action: "allow" })
      expect(agent.permission).toContainEqual({ permission: "bash", pattern: "*-delete*", action: "ask" })
      expect(Object.keys(agent.tools)).toEqual(
        expect.arrayContaining(["readonly_guard_review", "readonly_guard_update"]),
      )
      expect(box.events().find((event) => event.type === "init")).toMatchObject({ roAgents: ["plan", "explore"] })
    } finally {
      box.cleanup()
    }
  })
})
