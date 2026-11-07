import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { copyPlugin, hasOpencode, requireBuild, runDoctor, sandbox, type Sandbox } from "../helpers.js"

setDefaultTimeout(180_000)

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const step of cleanup.splice(0)) step()
})

/** A copy of the built plugin in a temporary directory, changed by `change`, and its `file://` spec. */
function copy(change: (dir: string) => void): { dir: string; spec: string } {
  requireBuild()
  const dir = mkdtempSync(join(tmpdir(), "rg-doctor-copy-"))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const spec = copyPlugin(dir)
  change(dir)
  return { dir, spec }
}

function track(box: Sandbox): Sandbox {
  cleanup.push(() => box.cleanup())
  return box
}

const doctor = runDoctor

describe.skipIf(!hasOpencode)("doctor against the real opencode", () => {
  test("active: exit status 0, the copy in charge and the guarded agents, the user's log untouched", () => {
    const box = track(sandbox())
    const run = doctor(box)
    expect(run.stderr).toBe("")
    expect(run.status).toBe(0)
    expect(run.stdout).toContain("in charge")
    expect(run.stdout).toMatch(/plan\s+guarded: \d+ bash rules/)
    expect(run.stdout).toContain("Guard active.")
    // doctor's own start was logged elsewhere
    expect(box.events()).toEqual([])
  })

  test("a checkout without dist/ is skipped by opencode without a word; doctor exits 1 and says why", () => {
    const unbuilt = copy((dir) => {
      rmSync(join(dir, "dist"), { recursive: true })
      mkdirSync(join(dir, "src"))
    })
    const box = track(sandbox({ plugin: unbuilt.spec }))
    // what doctor exists for: opencode starts and lists the entry as if nothing were wrong
    const config = box.opencode(["debug", "config"])
    expect(config.status).toBe(0)
    expect(config.stderr).toBe("")
    expect(box.events()).toEqual([])

    const run = doctor(box)
    expect(run.status).toBe(1)
    expect(run.stdout).toContain(
      `dist/index.js is missing: a checkout that was not built, run \`mise run build\` in ${unbuilt.dir}`,
    )
    expect(run.stdout).toMatch(/plan\s+NOT guarded/)
    expect(run.stdout).toContain("Guard NOT active: no copy of the plugin started")
  })

  test("a copy with a corrupt rule file is active with the copy built into it, and the error is reported", () => {
    const broken = copy((dir) => writeFileSync(join(dir, "rules", "commands.json"), "{ not json"))
    const box = track(sandbox({ plugin: broken.spec }))
    const run = doctor(box, "--json")
    expect(run.status).toBe(0)
    const report = JSON.parse(run.stdout) as {
      active: boolean
      entries: { state: string }[]
      startup: { builtin?: string[] }
      problems: { where: string; file?: string }[]
      warnings: string[]
    }
    expect(report.active).toBe(true)
    expect(report.entries.map((entry) => entry.state)).toEqual(["in charge"])
    expect(report.startup.builtin).toEqual(["commands.json"])
    expect(report.problems).toMatchObject([{ where: "rules", file: "commands.json" }])
    expect(report.warnings).toContain(
      "rules/commands.json cannot be read: the copy built into the plugin applies until the file is fixed",
    )
  })

  // opencode 1.19.3 checks engines.opencode for npm packages only: a path plugin runs whatever its range says
  test("a path copy outside its engines.opencode range is loaded by opencode; doctor warns", () => {
    const future = copy((dir) => {
      const file = join(dir, "package.json")
      const manifest = JSON.parse(readFileSync(file, "utf8")) as { engines: Record<string, string> }
      manifest.engines.opencode = ">=99"
      writeFileSync(file, JSON.stringify(manifest))
    })
    const box = track(sandbox({ plugin: future.spec }))
    const run = doctor(box)
    expect(run.status).toBe(0)
    expect(run.stdout).toContain("in charge")
    expect(run.stdout).toMatch(/requires opencode >=99, this is \d+\.\d+\.\d+: opencode does not check this for path/)
  })
})
