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
