import { afterEach, expect, test } from "bun:test"
import { sandbox } from "../helpers.js"

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
