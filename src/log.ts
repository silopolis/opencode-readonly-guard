import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs"
import { join } from "node:path"

export interface LogEvent {
  ts: string
  type: string
  agent?: string
  project?: string
  sessionID?: string
  callID?: string
  requestID?: string
  command?: string
  reason?: string
  permission?: string
  patterns?: string[]
  always?: string[]
  reply?: string
  [key: string]: unknown
}

export interface GuardLog {
  readonly file: string
  /** Append one event. Never throws: logging must not break a tool call. */
  write(event: Omit<LogEvent, "ts">): void
  /** All events, oldest first (the rotated file, then the current one). */
  read(): LogEvent[]
}

export const clip = (text: string, max = 2000): string => (text.length > max ? `${text.slice(0, max)}…` : text)

/** A JSON-lines event log in `dir/events.jsonl`, rotated to `events.old.jsonl` past `maxBytes`. */
export function createLog(dir: string, maxBytes = 5 * 1024 * 1024): GuardLog {
  const file = join(dir, "events.jsonl")
  const rotated = join(dir, "events.old.jsonl")
  let writes = 0
  return {
    file,
    write(event) {
      try {
        mkdirSync(dir, { recursive: true })
        if (writes++ % 100 === 0 && existsSync(file) && statSync(file).size > maxBytes) renameSync(file, rotated)
        appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`)
      } catch {
        // ignored on purpose
      }
    },
    read() {
      const events: LogEvent[] = []
      for (const path of [rotated, file]) {
        if (!existsSync(path)) continue
        for (const line of readFileSync(path, "utf8").split("\n")) {
          if (!line) continue
          try {
            events.push(JSON.parse(line) as LogEvent)
          } catch {
            // skip a corrupt line
          }
        }
      }
      return events
    },
  }
}
