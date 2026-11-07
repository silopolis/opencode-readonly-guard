import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { copyPlugin, hasOpencode, repoRoot, requireBuild, sandbox, type Sandbox } from "../helpers.js"

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

/** The built command-line tool, run with node like the installed bin, in the sandbox's project. */
function doctor(box: Sandbox, ...args: string[]) {
  requireBuild()
  const run = spawnSync("node", [join(repoRoot, "dist", "cli.js"), "doctor", ...args], {
    cwd: box.project,
    env: box.env,
    encoding: "utf8",
    timeout: 170_000,
  })
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

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

  test("a copy that failed closed: exit status 1, with the reason and the state of the write guard", () => {
    const broken = copy((dir) => writeFileSync(join(dir, "rules", "commands.json"), "{ not json"))
    const box = track(sandbox({ plugin: broken.spec }))
    const run = doctor(box, "--json")
    expect(run.status).toBe(1)
    const report = JSON.parse(run.stdout) as {
      active: boolean
      reason: string
      entries: { state: string }[]
      agents: { name: string; guarded: boolean; note?: string; bash: Record<string, string> }[]
    }
    expect(report.active).toBe(false)
    expect(report.reason).toContain("failed closed (load): readonly-guard: cannot load commands.json")
    expect(report.reason).toContain("the write guard is off")
    expect(report.entries.map((entry) => entry.state)).toEqual(["failed closed"])
    expect(report.agents).toContainEqual({
      name: "plan",
      guarded: true,
      note: "asks before every command",
      bash: { "*": "ask" },
    })
  })
})
