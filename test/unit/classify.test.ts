import { describe, expect, test } from "bun:test"
import { classifyPattern, normalizePattern } from "../../src/classify.js"
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

  test("accepts every shared allow pattern as an exact command", () => {
    for (const { pattern } of loadRules().allow) {
      const verdict = classifyPattern(pattern.replace(/\*$/, "x"))
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
