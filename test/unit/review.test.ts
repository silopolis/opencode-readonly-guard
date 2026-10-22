import { describe, expect, test } from "bun:test"
import type { LogEvent } from "../../src/log.js"
import { headOf, review, scopeToDirectory } from "../../src/review.js"
import { loadRules } from "../../src/rules.js"
import { emptyStore, type StoreData } from "../../src/store.js"

const rules = loadRules()
let clock = 0
const event = (fields: Partial<LogEvent> & { type: string }): LogEvent => ({
  ts: new Date(Date.UTC(2026, 9, 22, 10, 0, clock++)).toISOString(),
  ...fields,
})
const always = (pattern: string, general: string, agent = "plan"): LogEvent =>
  event({ type: "replied", reply: "always", permission: "bash", agent, patterns: [pattern], always: [general] })
const answers = (reply: string, pattern: string): LogEvent =>
  event({ type: "replied", reply, permission: "bash", agent: "plan", patterns: [pattern], always: [] })
const blocked = (command: string): LogEvent => event({ type: "blocked", reason: 'write redirection "> f"', command })
const run = (events: LogEvent[], store: StoreData = emptyStore(), limit?: number) =>
  review({ store, events, rules, limit })

describe("review", () => {
  test("an empty log reports nothing", () => {
    const text = run([])
    expect(text).toContain("Log: 0 events")
    expect(text).toContain("### Candidates")
    expect(text).toContain("(none)")
  })

  test("lists a candidate with vetted options", () => {
    const text = run([always("whoami", "whoami *")])
    expect(text).toContain("1. `whoami`: 1×, agents: plan, opencode remembered: `whoami *`")
    expect(text).toContain("[OK] exact: `whoami`")
    expect(text).toContain("[OK] general: `whoami *`")
  })

  test("refuses unsafe options and explains why", () => {
    const text = run([
      always("rtk proxy cat /etc/hostname", "rtk *", "explore"),
      always("npm --version", "npm --version *"),
    ])
    expect(text).toContain("[REFUSED: `rtk proxy` passes arbitrary commands through] exact")
    expect(text).toContain("[REFUSED: the command name must be literal (no wildcard)] general: `rtk *`")
    expect(text).toContain('"npm" is not a known read-only command')
    expect(text).toContain('[REFUSED: wildcards are only allowed for known read-only commands; "npm" is not one')
  })

  test("offers a directory-scoped option for paths", () => {
    const text = run([always("du -sh /var/log/syslog", "du *")])
    expect(text).toContain("[OK] directory: `du -sh /var/log/*`")
  })

  test("skips candidates that are already allowed or dismissed", () => {
    const events = [always("ls /tmp", "ls *"), always("whoami", "whoami *"), always("id -un", "id *")]
    const store: StoreData = { ...emptyStore(), allow: ["whoami *"], dismissed: ["id -un"] }
    const text = run(events, store)
    expect(text).not.toMatch(/^\d+\. `(ls \/tmp|whoami|id -un)`/m)
    expect(text).toContain('### Candidates from "always" answers (0)')
  })

  test("counts repeats, orders by count and honours the limit", () => {
    const events = [always("a1", "a1 *"), always("b1", "b1 *"), always("b1", "b1 *", "explore"), always("c1", "c1 *")]
    const text = run(events, emptyStore(), 2)
    expect(text).toContain("(3, showing 2)")
    expect(text).toContain("1. `b1`: 2×, agents: plan, explore")
    expect(text).not.toMatch(/^\d+\. `a1`/m)
  })

  test("summarizes prompt answers by command and suggests frequent approved ones", () => {
    const events = [
      answers("once", "whoami"),
      answers("once", "whoami"),
      answers("always", "whoami"),
      answers("reject", "git push"),
      answers("once", "git log --oneline"),
    ]
    const text = run(events)
    expect(text).toContain("- `whoami`: 2 / 1 / 0")
    expect(text).toContain("- `git push`: 0 / 0 / 1")
    expect(text).toContain("### Suggested additions")
    expect(text).toContain("[OK] general: `whoami *`")
    expect(text).not.toContain("general: `git push *`")
  })

  test("never suggests a head that was ever rejected or is unsafe", () => {
    const events = [
      ...Array.from({ length: 3 }, () => answers("once", "whoami")),
      answers("reject", "whoami"),
      ...Array.from({ length: 3 }, () => answers("once", "make test")),
    ]
    expect(run(events)).not.toContain("### Suggested additions")
  })

  test("groups blocks by reason", () => {
    const text = run([blocked("ls > f"), blocked("cat > f")])
    expect(text).toContain('- 2× write redirection "> f", e.g. `ls > f`')
  })

  test("flags learned rules that would be ignored at startup", () => {
    const text = run([], { ...emptyStore(), allow: ["whoami *", "rm *"] })
    expect(text).toContain("- `whoami *`\n")
    expect(text).toContain('- `rm *` [IGNORED at startup: "rm" modifies files or system state]')
  })

  test("tells the model not to invent patterns", () => {
    expect(run([])).toContain("Never propose a pattern that is not listed as [OK]")
  })
})

describe("helpers", () => {
  test("headOf groups by subcommand", () => {
    expect(headOf("git log --oneline")).toBe("git log")
    expect(headOf("npm --version")).toBe("npm")
    expect(headOf("rtk git status")).toBe("rtk git status")
    expect(headOf("whoami")).toBe("whoami")
    expect(headOf("")).toBe("")
  })

  test("scopeToDirectory", () => {
    expect(scopeToDirectory("cat /etc/hostname")).toBe("cat /etc/*")
    expect(scopeToDirectory("cat hostname")).toBeNull()
    expect(scopeToDirectory("cat /etc/*")).toBeNull()
    expect(scopeToDirectory("cat /hostname")).toBeNull()
    expect(scopeToDirectory("ls -la")).toBeNull()
    expect(scopeToDirectory("cat")).toBeNull()
  })
})
