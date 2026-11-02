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
    const text = run([always("uptime", "uptime *")])
    expect(text).toContain("1. `uptime`: 1×, agents: plan, opencode remembered: `uptime *`")
    expect(text).toContain("[OK] exact: `uptime`")
    expect(text).toContain("[OK] general: `uptime *`")
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

  test("herdr: a candidate the herdr-ui preset already allows is not proposed, and the preset is listed", () => {
    const events = [always("herdr tab rename w1:t1 plan ready", "herdr *")]
    const inside = { allow: [], presets: {}, insideHerdr: true }
    const text = review({ store: emptyStore(), events, rules, options: inside })
    expect(text).toContain("Presets in effect: herdr-ui")
    expect(text).toContain('### Candidates from "always" answers (0)')
    const outside = review({ store: emptyStore(), events, rules, options: { ...inside, insideHerdr: false } })
    expect(outside).not.toContain("Presets in effect")
    expect(outside).toContain("1. `herdr tab rename w1:t1 plan ready`")
  })

  test("herdr: opencode's general `herdr *` is refused, the exact UI command is offered", () => {
    const text = run([always("herdr tab rename w1:t1 plan ready", "herdr *")])
    expect(text).toContain("[OK] exact: `herdr tab rename w1:t1 plan ready`")
    expect(text).toContain("[REFUSED: herdr wildcards are only allowed after a read-only subcommand")
  })

  test("herdr: prompts are grouped by group and never turned into a suggested wildcard", () => {
    const text = run(Array.from({ length: 4 }, () => answers("once", "herdr agent prompt reviewer hi")))
    expect(text).toContain("- `herdr agent`: 4 / 0 / 0")
    expect(text).not.toContain("Suggested additions")
  })

  test("offers a directory-scoped option for paths", () => {
    const text = run([always("md5sum /var/log/syslog", "md5sum *")])
    expect(text).toContain("[OK] directory: `md5sum /var/log/*`")
  })

  test("skips candidates that are already allowed or dismissed", () => {
    const events = [always("ls /tmp", "ls *"), always("uptime", "uptime *"), always("id -un", "id *")]
    const store: StoreData = { ...emptyStore(), allow: ["uptime *"], dismissed: ["id -un"] }
    const text = run(events, store)
    expect(text).not.toMatch(/^\d+\. `(ls \/tmp|uptime|id -un)`/m)
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
      answers("once", "uptime"),
      answers("once", "uptime"),
      answers("always", "uptime"),
      answers("reject", "git push"),
      answers("once", "git log --oneline"),
    ]
    const text = run(events)
    expect(text).toContain("- `uptime`: 2 / 1 / 0")
    expect(text).toContain("- `git push`: 0 / 0 / 1")
    expect(text).toContain("### Suggested additions")
    expect(text).toContain("[OK] general: `uptime *`")
    expect(text).not.toContain("general: `git push *`")
  })

  test("never suggests a head that was ever rejected or is unsafe", () => {
    const events = [
      ...Array.from({ length: 3 }, () => answers("once", "uptime")),
      answers("reject", "uptime"),
      ...Array.from({ length: 3 }, () => answers("once", "make test")),
    ]
    expect(run(events)).not.toContain("### Suggested additions")
  })

  test("groups blocks by reason", () => {
    const text = run([blocked("ls > f"), blocked("cat > f")])
    expect(text).toContain('- 2× write redirection "> f", e.g. `ls > f`')
  })

  test("flags learned rules that would be ignored at startup", () => {
    const text = run([], { ...emptyStore(), allow: ["uptime *", "rm *"] })
    expect(text).toContain("- `uptime *`\n")
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
    expect(headOf("herdr agent list")).toBe("herdr agent")
    expect(headOf("uptime")).toBe("uptime")
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
