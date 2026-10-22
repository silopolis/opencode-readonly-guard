import { describe, expect, test } from "bun:test"
import { REVIEW_COMMAND_TEMPLATE, registerReviewCommand } from "../../src/command.js"
import { TOOL_REVIEW, TOOL_UPDATE } from "../../src/constants.js"
import type { MutableConfig } from "../../src/inject.js"

describe("registerReviewCommand", () => {
  test("registers a command that runs in the build agent", () => {
    const config: MutableConfig = {}
    expect(registerReviewCommand(config, "guard-review")).toBe(true)
    expect(config.command?.["guard-review"]).toMatchObject({ agent: "build", template: REVIEW_COMMAND_TEMPLATE })
  })

  test("never overrides a command the user defined", () => {
    const config: MutableConfig = { command: { "guard-review": { template: "mine" } } }
    expect(registerReviewCommand(config, "guard-review")).toBe(false)
    expect(config.command?.["guard-review"]).toEqual({ template: "mine" })
  })

  test("the template names both tools and keeps the arguments placeholder", () => {
    expect(REVIEW_COMMAND_TEMPLATE).toContain(TOOL_REVIEW)
    expect(REVIEW_COMMAND_TEMPLATE).toContain(TOOL_UPDATE)
    expect(REVIEW_COMMAND_TEMPLATE).toContain("$ARGUMENTS")
  })
})
