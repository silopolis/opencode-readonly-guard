import type { Hooks } from "@opencode-ai/plugin"

type Tools = NonNullable<Hooks["tool"]>

/** What a loaded copy of the plugin shares with the other copies in its opencode instance. */
export interface CopyInfo {
  /** The file the copy was loaded from (`import.meta.url`). */
  module: string
  /** Its tools: the other copies' tools run these while this copy is in charge. */
  tools: Tools
}

export interface Copy {
  /** Is this copy in charge of its opencode instance? The copy loaded last is. */
  active(): boolean
  /** The module of every copy loaded in the instance, in load order (the last one is in charge). */
  modules(): string[]
  /** This copy's tools, each running the tool of the copy in charge. */
  tools: Tools
}

/**
 * Where the copies find each other. Each copy is a module of its own (a global and a project entry with different
 * specs, two checkouts), so the list lives on `globalThis`, one per opencode instance: opencode hands the same input
 * object to every plugin of an instance, and a server process holds one instance per directory. The version in the
 * key follows the shape of `CopyInfo`; copies that do not share it cannot see each other, and both run.
 */
const REGISTRY = Symbol.for("opencode-readonly-guard.copies.v1")

function registry(): WeakMap<object, CopyInfo[]> {
  const holder = globalThis as { [REGISTRY]?: unknown }
  if (!(holder[REGISTRY] instanceof WeakMap)) holder[REGISTRY] = new WeakMap<object, CopyInfo[]>()
  return holder[REGISTRY] as WeakMap<object, CopyInfo[]>
}

/**
 * Record a copy that started successfully in the opencode instance identified by `instance` (the plugin input).
 *
 * The copy loaded last is in charge, like the last of two identical specs in opencode's own deduplication: opencode
 * loads global configuration before the project's, so a project entry wins over a global one, options included. The
 * other copies stay passive: opencode runs every `server()` before any config hook, so by the time hooks run the
 * last copy is known, and they skip the config hook, the runtime hooks and the tool registration. Their tools, in
 * case opencode registered them anyway, run the tools of the copy in charge.
 */
export function registerCopy(instance: object, info: CopyInfo): Copy {
  const instances = registry()
  const copies = instances.get(instance) ?? []
  instances.set(instance, copies)
  copies.push(info)
  const inCharge = (): CopyInfo => copies.at(-1) ?? info
  const tools: Tools = {}
  for (const [name, definition] of Object.entries(info.tools)) {
    tools[name] = {
      ...definition,
      execute: (args, context) => (inCharge().tools[name] ?? definition).execute(args, context),
    }
  }
  return { active: () => inCharge() === info, modules: () => copies.map((copy) => copy.module), tools }
}

/** A copy of the plugin that could not start (its rule files cannot be read). */
export interface FailedCopyInfo {
  /** The file the copy was loaded from. */
  module: string
  /** Why it could not start. */
  error: string
  /** Did it keep the write guard (`commands.json` could be read)? */
  writeGuard: boolean
}

export interface FailedCopy {
  /**
   * Must this copy fail closed? Only when no copy started in its instance, and it is the failed copy loaded last
   * among those that kept the write guard (or among all of them, if none did).
   */
  inCharge(): boolean
}

/**
 * Where the copies that failed are recorded. A key of its own, so that the copies key keeps its shape and copies
 * built before failures were recorded still see the others; a copy that started under either version counts.
 */
const FAILED = Symbol.for("opencode-readonly-guard.failed.v1")

function failures(): WeakMap<object, FailedCopyInfo[]> {
  const holder = globalThis as { [FAILED]?: unknown }
  if (!(holder[FAILED] instanceof WeakMap)) holder[FAILED] = new WeakMap<object, FailedCopyInfo[]>()
  return holder[FAILED] as WeakMap<object, FailedCopyInfo[]>
}

/**
 * Record a copy that failed to start. Asked at config time, once every copy has started (or not): a copy that
 * started, loaded before or after, is in charge and the failed ones stay passive; otherwise the failed copy loaded
 * last fails closed, so that read-only agents are not left with opencode's defaults.
 */
export function registerFailedCopy(instance: object, info: FailedCopyInfo): FailedCopy {
  const all = failures()
  const failed = all.get(instance) ?? []
  all.set(instance, failed)
  failed.push(info)
  const chosen = () => failed.findLast((copy) => copy.writeGuard) ?? failed.at(-1)
  return { inCharge: () => !registry().get(instance)?.length && chosen() === info }
}

/** The copies that failed to start in an opencode instance, in load order. */
export function failedCopies(instance: object): FailedCopyInfo[] {
  return [...(failures().get(instance) ?? [])]
}
