import { describe, expect, test } from "bun:test"
import { evaluate, wildcardMatch, type RuleEntry } from "../../src/wildcard.js"

describe("wildcardMatch (opencode semantics)", () => {
  test("star matches anything, including spaces", () => {
    expect(wildcardMatch("git log --oneline -5", "git log*")).toBe(true)
    expect(wildcardMatch("cat /etc/hostname", "cat *")).toBe(true)
  })

  test("a trailing ' *' also matches the bare command", () => {
    expect(wildcardMatch("ls", "ls *")).toBe(true)
    expect(wildcardMatch("lsinitcpio -x img", "ls *")).toBe(false)
  })

  test("a trailing '*' without a space matches command prefixes", () => {
    expect(wildcardMatch("lsinitcpio -x img", "ls*")).toBe(true)
  })

  test("patterns are anchored and literal otherwise", () => {
    expect(wildcardMatch("uname", "uname -r")).toBe(false)
    expect(wildcardMatch("a.b", "a.b")).toBe(true)
    expect(wildcardMatch("axb", "a.b")).toBe(false)
  })

  test("question mark matches one character", () => {
    expect(wildcardMatch("ls -a", "ls -?")).toBe(true)
    expect(wildcardMatch("ls -ab", "ls -?")).toBe(false)
  })

  test("newlines are matched by star", () => {
    expect(wildcardMatch("cat a\nb", "cat *")).toBe(true)
  })
})

describe("evaluate", () => {
  const rules: RuleEntry[] = [
    ["*", "ask"],
    ["find *", "allow"],
    ["*-delete*", "ask"],
  ]

  test("the last matching rule wins", () => {
    expect(evaluate("find . -name x", rules)).toBe("allow")
    expect(evaluate("find . -delete", rules)).toBe("ask")
  })

  test("falls back when nothing matches", () => {
    expect(evaluate("anything", [["x", "allow"]])).toBe("ask")
    expect(evaluate("anything", [["x", "allow"]], "allow")).toBe("allow")
  })
})
