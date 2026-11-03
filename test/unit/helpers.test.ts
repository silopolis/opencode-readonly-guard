import { afterEach, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pluginUrl, sandbox } from "../helpers.js"

// Inside a git hook (the pre-push hook runs this suite), GIT_DIR and GIT_WORK_TREE are set: restore them too.
const restored = ["HERDR_ENV", "HERDR_CONFIG_PATH", "GIT_DIR", "GIT_WORK_TREE"] as const
const saved = Object.fromEntries(restored.map((name) => [name, process.env[name]]))
const scratch: string[] = []
afterEach(() => {
  for (const name of restored) {
    const value = saved[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** git on the repository in `cwd` and no other, whatever GIT_* variables this process has. */
function git(cwd: string, ...args: string[]): string {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")))
  const result = spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], {
    cwd,
    env,
    encoding: "utf8",
  })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr}`)
  return result.stdout.trim()
}

/** A repository with one commit and a linked worktree, like the checkout a worker pushes from. */
function linkedWorktree() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "rg-hook-")))
  scratch.push(dir)
  const main = join(dir, "main")
  const worktree = join(dir, "worktree")
  mkdirSync(main)
  git(main, "init", "-q")
  git(main, "commit", "-q", "--allow-empty", "-m", "first")
  git(main, "worktree", "add", "-q", "-b", "feature", worktree)
  return {
    main,
    worktree,
    gitDir: git(worktree, "rev-parse", "--absolute-git-dir"),
    config: join(main, ".git", "config"),
  }
}

/** What a stray `git init` or `git commit` would change: the shared config, both HEADs, the refs. */
function state(repo: ReturnType<typeof linkedWorktree>) {
  return {
    core: git(repo.main, "config", "--file", repo.config, "--get-regexp", "^core\\.(bare|worktree)$"),
    config: readFileSync(repo.config, "utf8"),
    heads: [readFileSync(join(repo.main, ".git", "HEAD"), "utf8"), readFileSync(join(repo.gitDir, "HEAD"), "utf8")],
    refs: git(repo.main, "for-each-ref", "--format=%(refname) %(objectname)"),
  }
}

// git exports GIT_DIR to a hook in a linked worktree, and hk adds GIT_WORK_TREE to its steps. Inherited, they made
// the sandbox's `git init` write core.bare or core.worktree into the worker's shared config, and its `git commit`
// commit on the worker's branch.
test.each([
  ["GIT_DIR", false],
  ["GIT_DIR and GIT_WORK_TREE", true],
])("a hook's %s does not take the sandbox's git to the caller's repository", (_, withWorkTree) => {
  const repo = linkedWorktree()
  const before = state(repo)
  expect(before.core).toBe("core.bare false")
  process.env.GIT_DIR = repo.gitDir
  if (withWorkTree) process.env.GIT_WORK_TREE = repo.worktree
  else delete process.env.GIT_WORK_TREE
  const box = sandbox()
  try {
    expect(state(repo)).toEqual(before)
    expect(Object.keys(box.env).filter((name) => name.startsWith("GIT_"))).toEqual([])
    expect(git(box.project, "rev-parse", "--absolute-git-dir")).toBe(realpathSync(join(box.project, ".git")))
    expect(git(box.project, "log", "--format=%s")).toBe("init")
  } finally {
    box.cleanup()
  }
})

test("the sandbox does not inherit the caller's herdr environment", () => {
  process.env.HERDR_ENV = "1"
  process.env.HERDR_CONFIG_PATH = "/somewhere/config.toml"
  const box = sandbox()
  try {
    expect(Object.keys(box.env).filter((name) => name.startsWith("HERDR_"))).toEqual([])
    expect(box.env.READONLY_GUARD_STORE).toBe(box.store)
  } finally {
    box.cleanup()
  }
})

test("a global plugin entry goes to the sandbox's own config directory, never the real one", () => {
  const box = sandbox({ globalPlugin: [pluginUrl, { allow: ["id -un"] }] })
  try {
    const file = join(box.env.XDG_CONFIG_HOME!, "opencode", "opencode.json")
    expect(file.startsWith(box.dir)).toBe(true)
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ plugin: [[pluginUrl, { allow: ["id -un"] }]] })
  } finally {
    box.cleanup()
  }
  expect(() => sandbox({ globalPlugin: pluginUrl, realHome: true })).toThrow("globalPlugin")
  const plain = sandbox()
  try {
    expect(existsSync(join(plain.env.XDG_CONFIG_HOME!, "opencode", "opencode.json"))).toBe(false)
  } finally {
    plain.cleanup()
  }
})

test("`herdr: true` simulates a herdr pane with a config directory of its own", () => {
  process.env.HERDR_CONFIG_PATH = "/somewhere/config.toml"
  const box = sandbox({ herdr: true })
  try {
    expect(box.env.HERDR_ENV).toBe("1")
    expect(box.env.HERDR_CONFIG_PATH?.startsWith(box.dir)).toBe(true)
    expect(
      Object.keys(box.env)
        .filter((name) => name.startsWith("HERDR_"))
        .toSorted(),
    ).toEqual(["HERDR_CONFIG_PATH", "HERDR_ENV"])
  } finally {
    box.cleanup()
  }
})
