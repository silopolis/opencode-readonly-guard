import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { LogEvent } from "../../src/log.js"
import { evaluate, type Action, type RuleEntry } from "../../src/wildcard.js"
import {
  agentRules,
  copyPlugin,
  hasOpencode,
  repoRoot,
  runDoctor,
  sandbox,
  withServer,
  type Sandbox,
} from "../helpers.js"

setDefaultTimeout(240_000)

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const step of cleanup.splice(0)) step()
})

/**
 * A sandbox whose project is a checkout of the plugin (`package.json`, `rules/`, `src/`, and `dist/` unless
 * `built: false`) with `"plugin": ["."]` in its opencode.json, as in this repository.
 */
function checkout({ built = true, globalPlugin }: { built?: boolean; globalPlugin?: string } = {}): Sandbox {
  const box = sandbox({ plugin: ".", globalPlugin })
  cleanup.push(() => box.cleanup())
  copyPlugin(box.project)
  mkdirSync(join(box.project, "src"))
  if (!built) rmSync(join(box.project, "dist"), { recursive: true })
  return box
}

/** A checkout elsewhere (the main one), built, and its `file://` spec. */
function mainCheckout(): { dir: string; spec: string } {
  const dir = mkdtempSync(join(tmpdir(), "rg-main-"))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  return { dir, spec: copyPlugin(dir) }
}

const moduleIn = (dir: string) => pathToFileURL(join(dir, "dist", "index.js")).href
const inits = (events: LogEvent[]) => events.filter((event) => event.type === "init")

/** An agent's bash rules, and the events of the one opencode process that resolved them. */
function resolve(box: Sandbox, agent = "plan"): { rules: RuleEntry[]; bash: string[]; events: LogEvent[] } {
  const before = box.events().length
  const rules = agentRules(box, agent)
    .filter((rule) => rule.permission === "bash")
    .map((rule): RuleEntry => [rule.pattern, rule.action as Action])
  return { rules, bash: rules.map(([pattern, action]) => `${pattern}=${action}`), events: box.events().slice(before) }
}

/** The rules the plugin injects (from its `"*": ask` on), in a checkout configured with `"."` alone. */
let baseline: string[] | undefined
function pluginRules(bash: string[]): string[] {
  return bash.slice(bash.lastIndexOf("*=ask"))
}
function baselineRules(): string[] {
  baseline ??= pluginRules(resolve(checkout()).bash)
  return baseline
}

// This repository's opencode.json loads its own build: "plugin": ["."], which opencode resolves to file://<checkout>.
describe.skipIf(!hasOpencode)("a checkout that loads its own build", () => {
  test("(a) without dist/ it is skipped without a word: opencode starts, a session opens, doctor says why", async () => {
    const box = checkout({ built: false })
    const config = box.opencode(["debug", "config"])
    expect(config.status).toBe(0)
    expect(config.stderr).toBe("")
    const origins = (JSON.parse(config.stdout) as { plugin_origins: { spec: unknown }[] }).plugin_origins
    expect(origins.map((origin) => origin.spec)).toEqual([pathToFileURL(box.project).href])

    const session = await withServer(box, async (url) => {
      const response = await fetch(`${url}/session`, {
        method: "POST",
        headers: { "x-opencode-directory": box.project, "content-type": "application/json" },
        body: "{}",
      })
      return { status: response.status, body: (await response.json()) as { id?: unknown; directory?: unknown } }
    })
    expect(session.status).toBe(200)
    expect(typeof session.body.id).toBe("string")
    expect(session.body.directory).toBe(box.project)
    expect(box.events()).toEqual([])

    const doctor = runDoctor(box)
    expect(doctor.status).toBe(1)
    expect(doctor.stdout).toContain(
      `dist/index.js is missing: a checkout that was not built, run \`mise run build\` in ${box.project}`,
    )
    expect(doctor.stdout).toContain("Guard NOT active: no copy of the plugin started")
  })

  test("(b) with a global entry to the same checkout: one copy in charge, one init, the rules once", () => {
    const expected = baselineRules()
    // opencode merges the same spec; with a trailing slash it keeps both entries, which import the same module
    for (const [suffix, entries] of [
      ["", 1],
      ["/", 2],
    ] as const) {
      const box = checkout()
      box.writeGlobalPlugin(`${pathToFileURL(box.project).href}${suffix}`)
      const { bash, events } = resolve(box)
      expect(inits(events)).toMatchObject([{ module: moduleIn(box.project) }])
      expect(inits(events)[0].copies).toEqual(Array(entries).fill(moduleIn(box.project)))
      expect(bash).toEqual(expected)
      expect(new Set(bash).size).toBe(bash.length)
    }
  })

  test("(c) a worktree's own build is in charge over a global entry to the main checkout; unbuilt, the main one guards it", () => {
    const main = mainCheckout()
    const built = checkout({ globalPlugin: main.spec })
    const worktree = resolve(built)
    expect(inits(worktree.events)).toMatchObject([
      { module: moduleIn(built.project), copies: [moduleIn(main.dir), moduleIn(built.project)] },
    ])
    expect(worktree.bash).toEqual(baselineRules())

    const unbuilt = checkout({ built: false, globalPlugin: main.spec })
    const fallback = resolve(unbuilt)
    expect(inits(fallback.events)).toMatchObject([{ module: moduleIn(main.dir), copies: [moduleIn(main.dir)] }])
    expect(fallback.bash).toEqual(baselineRules())
    const doctor = runDoctor(unbuilt)
    expect(doctor.status).toBe(0)
    expect(doctor.stdout).toContain(`${pathToFileURL(unbuilt.project).href} was not loaded: dist/index.js is missing`)
  })

  test("(d) this repository's opencode.json loads the checkout's build once; read-only agents get the shared rules", () => {
    const box = checkout()
    box.write("opencode.json", readFileSync(join(repoRoot, "opencode.json"), "utf8"))
    const plan = resolve(box)
    expect(inits(plan.events)).toMatchObject([{ module: moduleIn(box.project), copies: [moduleIn(box.project)] }])
    // the plugin's rules, once, after the repository's own
    expect(pluginRules(plan.bash)).toEqual(baselineRules())
    expect(evaluate("ls -la", plan.rules)).toBe("allow")
    expect(evaluate("git status", plan.rules)).toBe("allow")
    expect(evaluate("rm -rf dist", plan.rules)).toBe("ask")
    // the repository's allowances come before the plugin's "*": ask, so in read-only agents only the shared
    // allowlist runs without a prompt; build keeps them
    expect(evaluate("mise run check", plan.rules)).toBe("ask")
    expect(evaluate("gh pr view 12", plan.rules)).toBe("ask")
    const build = resolve(box, "build")
    expect(evaluate("mise run check", build.rules)).toBe("allow")
    expect(evaluate("gh pr view 12", build.rules)).toBe("allow")
  })
})
