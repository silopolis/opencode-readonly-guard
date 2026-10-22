import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

export interface StoreData {
  /** Learned bash patterns allowed in read-only agents. */
  allow: string[]
  /** Candidates the user does not want to see again. */
  dismissed: string[]
  agents: { include: string[]; exclude: string[] }
}

const COMMENT =
  "readonly-guard: 'allow' = extra bash patterns allowed in read-only agents (added via /guard-review); " +
  "'dismissed' = candidates not to propose again; 'agents' = include/exclude agent names. Applied at opencode startup."

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []

export const emptyStore = (): StoreData => ({ allow: [], dismissed: [], agents: { include: [], exclude: [] } })

/**
 * Read the learned-rules file. A missing file is an empty store. A corrupt file throws, unless `onError` is given,
 * in which case it is reported and an empty store is returned (the plugin must keep working at startup).
 */
export function loadStore(file: string, onError?: (error: Error) => void): StoreData {
  if (!existsSync(file)) return emptyStore()
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>
    const agents = (raw.agents ?? {}) as Record<string, unknown>
    return {
      allow: strings(raw.allow),
      dismissed: strings(raw.dismissed),
      agents: { include: strings(agents.include), exclude: strings(agents.exclude) },
    }
  } catch (error) {
    const failure = new Error(`cannot parse ${file}`, { cause: error })
    if (!onError) throw failure
    onError(failure)
    return emptyStore()
  }
}

/** Write atomically (temp file, then rename). */
export function saveStore(file: string, data: StoreData): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, `${JSON.stringify({ $comment: COMMENT, ...data }, null, 2)}\n`)
  renameSync(`${file}.tmp`, file)
}
