import { describe, expect, test } from "bun:test"
import { classifyPattern, isHerdrUiPattern, normalizePattern } from "../../src/classify.js"
import { loadRules } from "../../src/rules.js"

describe("normalizePattern", () => {
  test("trims and collapses whitespace", () => {
    expect(normalizePattern("  cat   /etc/*  ")).toBe("cat /etc/*")
  })
})

describe("classifyPattern", () => {
  test("accepts an exact unknown command with a caution", () => {
    const verdict = classifyPattern("npm --version")
    expect(verdict.ok).toBe(true)
    expect(verdict.note).toContain("not a known read-only command")
  })

  test("accepts an exact known command without a caution", () => {
    expect(classifyPattern("whoami")).toEqual({ ok: true, note: "exact command" })
  })

  test("accepts wildcards for wildcard-safe commands and read-only git subcommands", () => {
    expect(classifyPattern("whoami *").ok).toBe(true)
    expect(classifyPattern("git log *").ok).toBe(true)
    expect(classifyPattern("rtk read *").ok).toBe(true)
  })

  test("accepts every shared allow pattern, as written or as an exact command", () => {
    for (const { pattern } of loadRules().allow) {
      // `date x` sets the clock, but `date *` is fine; `npm view *` is not wildcard-safe, but `npm view x` is
      const verdict = classifyPattern(pattern).ok
        ? classifyPattern(pattern)
        : classifyPattern(pattern.replace(/\*$/, "x"))
      expect({ pattern, ok: verdict.ok, reason: verdict.reason }).toEqual({ pattern, ok: true, reason: undefined })
    }
  })

  test("refuses writing commands even as exact patterns", () => {
    expect(classifyPattern("rm x").ok).toBe(false)
    expect(classifyPattern("git push").ok).toBe(false)
  })

  test("never accepts a wildcard in the command name", () => {
    expect(classifyPattern("r* x").reason).toContain("command name")
  })

  test("uses the supplied classification", () => {
    const commands = { ...loadRules().commands, wildcardSafe: [] }
    expect(classifyPattern("whoami *", commands).ok).toBe(false)
  })
})

const refused = (pattern: string): string | undefined => classifyPattern(pattern).reason

describe("classifyPattern: herdr", () => {
  test("accepts read-only subcommands, exact or with a wildcard after them", () => {
    for (const pattern of [
      "herdr agent list",
      "herdr agent list *",
      "herdr agent read reviewer --lines 20",
      "herdr pane read *",
      "herdr pane wait-output *",
      "herdr tab list *",
      "herdr status *",
      "herdr status --json",
      "herdr plugin log list *",
      "herdr api schema *",
      "rtk herdr agent list *",
    ]) {
      expect({ pattern, verdict: classifyPattern(pattern) }).toEqual({ pattern, verdict: { ok: true } })
    }
  })

  test("accepts help and version only exactly, never with a wildcard", () => {
    for (const pattern of [
      "herdr --help",
      "herdr -V",
      "herdr --skill",
      "herdr agent",
      "herdr agent --help",
      "herdr tab -h",
    ]) {
      expect({ pattern, ok: classifyPattern(pattern).ok }).toEqual({ pattern, ok: true })
    }
    for (const pattern of ["herdr --help *", "herdr --version *", "herdr agent --help *", "herdr agent *"]) {
      expect({ pattern, ok: classifyPattern(pattern).ok }).toEqual({ pattern, ok: false })
    }
  })

  test("accepts the opt-in UI subcommands with a caution, and only the UI ones", () => {
    for (const pattern of ["herdr notification show *", "herdr tab rename *", "herdr tab rename w1:t1 plan ready"]) {
      const verdict = classifyPattern(pattern)
      expect({ pattern, ok: verdict.ok }).toEqual({ pattern, ok: true })
      expect(verdict.note).toContain("opt-in UI command")
    }
    expect(refused("herdr tab *")).toContain("after a read-only subcommand")
    expect(refused("herdr tab rename*")).toContain("after a read-only subcommand")
    expect(refused("herdr notification *")).toContain("after a read-only subcommand")
  })

  test("refuses every other subcommand, exact or not", () => {
    for (const pattern of [
      "herdr agent prompt *",
      "herdr agent prompt reviewer hello",
      "herdr agent send-keys reviewer esc",
      "herdr pane send-text *",
      "herdr pane send-keys w1:p2 enter",
      "herdr pane close w1:p2",
      "herdr pane focus *",
      "herdr tab create",
      "herdr tab close *",
      "herdr workspace create",
      "herdr session stop old",
      "herdr server",
      "herdr server stop",
      "herdr terminal attach *",
      "herdr plugin pane open *",
      "herdr plugin disable x",
    ]) {
      expect({ pattern, reason: refused(pattern) }).toEqual({
        pattern,
        reason: expect.stringContaining("not a read-only herdr command"),
      })
    }
  })

  test("refuses herdr alone, a bare wildcard and wildcards in the subcommand", () => {
    expect(refused("herdr")).toContain("starts the terminal UI")
    for (const pattern of ["herdr *", "herdr agent l*", "herdr * list", "herdr a*", "herdr server *"]) {
      expect({ pattern, reason: refused(pattern) }).toEqual({
        pattern,
        reason: expect.stringContaining("after a read-only subcommand"),
      })
    }
  })

  test("refuses global options that send the command to another session or machine", () => {
    for (const pattern of [
      "herdr --machine box agent list",
      "herdr --session work agent list *",
      "herdr --remote me@h",
    ]) {
      expect(refused(pattern)).toContain("global options")
    }
  })

  test("refuses the flag that grants Git trust", () => {
    expect(refused("herdr worktree list --trust-repository")).toContain("--trust-repository")
    expect(classifyPattern("herdr worktree list *").ok).toBe(true)
  })

  test("refuses what the write guard blocks, with its reason", () => {
    expect(refused("herdr update")).toContain("herdr update")
    expect(refused("herdr worktree create *")).toContain("herdr worktree create")
    expect(refused("herdr api schema --output f")).toContain("--output")
    expect(refused("herdr pane run w1:p2 rm x")).toContain("herdr pane run")
  })

  test("isHerdrUiPattern recognises the UI subcommands, and only them", () => {
    const { commands } = loadRules()
    for (const pattern of [
      "herdr tab rename *",
      "herdr notification show *",
      "herdr tab rename w1:t1 x",
      "rtk herdr tab rename *",
    ]) {
      expect({ pattern, ui: isHerdrUiPattern(pattern, commands) }).toEqual({ pattern, ui: true })
    }
    for (const pattern of [
      "herdr tab *",
      "herdr tab list *",
      "herdr tab rename*",
      "herdr agent list *",
      "tab rename *",
      "ls *",
    ]) {
      expect({ pattern, ui: isHerdrUiPattern(pattern, commands) }).toEqual({ pattern, ui: false })
    }
  })

  test("the four lists do not overlap", () => {
    const { help, read, ui, write } = loadRules().commands.herdr
    const all = [...help, ...read, ...ui, ...write]
    expect(new Set(all).size).toBe(all.length)
  })
})
