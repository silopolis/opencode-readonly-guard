import { afterEach, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { pluginUrl, sandbox } from "../helpers.js"

const saved = { env: process.env.HERDR_ENV, config: process.env.HERDR_CONFIG_PATH }
afterEach(() => {
  for (const [name, value] of [
    ["HERDR_ENV", saved.env],
    ["HERDR_CONFIG_PATH", saved.config],
  ] as const) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
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
