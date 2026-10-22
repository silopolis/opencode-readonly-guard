import type { PluginModule } from "@opencode-ai/plugin"
import { PLUGIN_ID } from "./constants.js"
import { server } from "./plugin.js"

// opencode calls every export of a plugin module as a plugin: keep the default export the only one.
const plugin: PluginModule = { id: PLUGIN_ID, server }

export default plugin
