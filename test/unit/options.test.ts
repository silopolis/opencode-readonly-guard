import { describe, expect, test } from "bun:test"
import { resolveOptions } from "../../src/options.js"

describe("resolveOptions", () => {
  test("defaults to the XDG locations", () => {
    const options = resolveOptions(undefined, { XDG_CONFIG_HOME: "/cfg", XDG_DATA_HOME: "/data" })
    expect(options.storeFile).toBe("/cfg/opencode/readonly-guard.json")
    expect(options.logDir).toBe("/data/opencode/readonly-guard")
    expect(options).toMatchObject({
      toast: true,
      command: "guard-review",
      allow: [],
      includeAgents: [],
      excludeAgents: [],
    })
    expect(options.warnings).toEqual([])
  })

  test("environment variables override the defaults", () => {
    const options = resolveOptions({}, { READONLY_GUARD_STORE: "/s.json", READONLY_GUARD_DATA: "/d" })
    expect(options).toMatchObject({ storeFile: "/s.json", logDir: "/d" })
  })

  test("options override the environment", () => {
    const options = resolveOptions({ store: "/mine.json", logDir: "/mine" }, { READONLY_GUARD_STORE: "/s.json" })
    expect(options).toMatchObject({ storeFile: "/mine.json", logDir: "/mine" })
  })

  test("reads agents, allow, toast and command", () => {
    const options = resolveOptions({
      agents: { include: ["review"], exclude: ["plan"] },
      allow: ["whoami *"],
      toast: false,
      command: false,
    })
    expect(options).toMatchObject({
      includeAgents: ["review"],
      excludeAgents: ["plan"],
      allow: ["whoami *"],
      toast: false,
      command: false,
    })
  })

  test("ignores wrongly typed values and says so", () => {
    const options = resolveOptions({ allow: "whoami", toast: "no", store: 3, command: 5 })
    expect(options).toMatchObject({ allow: [], toast: true, command: "guard-review" })
    expect(options.warnings).toHaveLength(4)
  })

  test("tolerates non-object options", () => {
    expect(resolveOptions("nonsense").toast).toBe(true)
    expect(resolveOptions([]).toast).toBe(true)
  })
})
