import { classifyPattern, isHerdrUiPattern, normalizePattern } from "./classify.js"
import type { Commands } from "./rules.js"
import type { StoreData } from "./store.js"

/** A rule set the plugin ships but the user can switch on or off, kept apart from the shared allowlist. */
export interface Preset {
  /** The name used in the `presets` option and in the store. */
  id: string
  summary: string
  enabledByDefault: boolean
  /** Only has an effect when opencode runs in a herdr pane (`HERDR_ENV=1`). */
  insideHerdrOnly: boolean
  patterns(commands: Commands): string[]
}

export const PRESETS: readonly Preset[] = [
  {
    id: "herdr-ui",
    summary: "herdr commands that only change what herdr displays (a tab label, a notification)",
    enabledByDefault: true,
    insideHerdrOnly: true,
    patterns: ({ herdr }) => herdr.ui.map((path) => `herdr ${path} *`),
  },
]

export interface SourceProblem {
  /** Which source the problem comes from: `store`, `options` or `presets`. */
  where: string
  pattern?: string
  error: string
}

export interface Effective {
  /** Everything allowed on top of the shared allowlist: the presets' patterns, then the user's. */
  patterns: string[]
  /** The user's own patterns that apply (store and options), without the presets'. */
  learned: string[]
  /** The presets in effect. */
  presets: string[]
  /** Values that were ignored, to be logged. */
  problems: SourceProblem[]
}

export interface EffectiveInput {
  commands: Commands
  store: Pick<StoreData, "allow" | "presets">
  options: { allow: readonly string[]; presets: Readonly<Record<string, boolean>>; insideHerdr: boolean }
}

/**
 * Combine the sources of allow rules into what a read-only agent gets on top of the shared allowlist.
 *
 * - Every user pattern passes the same safety check as a learned rule.
 * - herdr UI patterns only take effect inside herdr: outside a pane the herdr CLI still reaches the running session
 *   and acts on whatever is focused there.
 * - A preset is on when its default says so and no source switches it off. When sources disagree, the later one
 *   wins: plugin options, then the store.
 */
export function effectiveRules({ commands, store, options }: EffectiveInput): Effective {
  const problems: SourceProblem[] = []
  const vet = (patterns: readonly string[], where: string): string[] =>
    patterns.map(normalizePattern).filter((pattern) => {
      const verdict = classifyPattern(pattern, commands)
      if (!verdict.ok) problems.push({ where, pattern, error: `ignored rule: ${verdict.reason}` })
      return verdict.ok
    })
  const applies = (pattern: string): boolean => options.insideHerdr || !isHerdrUiPattern(pattern, commands)
  const learned = [...vet(store.allow, "store"), ...vet(options.allow, "options")].filter(applies)

  const switched = new Map<string, boolean>()
  for (const table of [options.presets, store.presets]) {
    for (const [id, on] of Object.entries(table)) {
      if (PRESETS.some((preset) => preset.id === id)) switched.set(id, on)
      else problems.push({ where: "presets", error: `unknown preset "${id}" ignored` })
    }
  }
  const active = PRESETS.filter(
    (preset) =>
      (switched.get(preset.id) ?? preset.enabledByDefault) && (options.insideHerdr || !preset.insideHerdrOnly),
  )
  return {
    patterns: [...active.flatMap((preset) => preset.patterns(commands)), ...learned],
    learned,
    presets: active.map((preset) => preset.id),
    problems,
  }
}
