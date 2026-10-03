export { SCRIBE_PLUGIN_API } from '@/lib/plugins/types'
export type {
  PluginApi,
  PluginCommand,
  PluginCommandDefinition,
  PluginManifest,
  PluginModule,
  PluginPermission,
  RegisteredPlugin,
} from '@/lib/plugins/types'

export { bootstrapPlugins } from '@/lib/plugins/bootstrap'
export { listPluginCommands, getPluginCommand } from '@/lib/plugins/commands'
export {
  getPlugin,
  getPluginsGeneration,
  listPlugins,
  setPluginActive,
  subscribePlugins,
  syncEnabledPlugins,
} from '@/lib/plugins/registry'
export { isPluginEnabled, setPluginEnabled } from '@/lib/plugins/prefs'
export { createPluginStorage, pluginStorageKey } from '@/lib/plugins/storage'
