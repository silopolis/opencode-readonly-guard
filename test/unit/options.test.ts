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

  test("reads presets, and whether opencode runs inside herdr", () => {
    expect(resolveOptions({ presets: { "herdr-ui": false } }, {})).toMatchObject({
      presets: { "herdr-ui": false },
      insideHerdr: false,
    })
    expect(resolveOptions({}, { HERDR_ENV: "1" })).toMatchObject({ presets: {}, insideHerdr: true })
    expect(resolveOptions({}, { HERDR_ENV: "0" }).insideHerdr).toBe(false)
    expect(resolveOptions({}, { HERDR_ENV: "true" }).insideHerdr).toBe(false)
  })

  test("ignores wrongly typed values and says so", () => {
    const options = resolveOptions({
      allow: "whoami",
      toast: "no",
      store: 3,
      command: 5,
      presets: { "herdr-ui": "off" },
    })
    expect(options).toMatchObject({ allow: [], toast: true, command: "guard-review", presets: {} })
    expect(options.warnings).toHaveLength(5)
    expect(resolveOptions({ presets: ["herdr-ui"] }).warnings).toHaveLength(1)
  })

  test("tolerates non-object options", () => {
    expect(resolveOptions("nonsense").toast).toBe(true)
    expect(resolveOptions([]).toast).toBe(true)
  })
})
