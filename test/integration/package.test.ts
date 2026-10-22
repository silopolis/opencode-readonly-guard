import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { hasOpencode, repoRoot, requireBuild, sandbox } from "../helpers.js"

setDefaultTimeout(300_000)

let work: string
let tarball: string
let installed: string
let files: string[]

const sh = (command: string, args: string[], cwd: string) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" })
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
})
afterAll(() => rmSync(work, { recursive: true, force: true }))

describe("npm package", () => {
  test("ships the build, the shared rules and the licence, and nothing else", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "dist/index.js",
        "dist/index.d.ts",
        "dist/cli.js",
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
