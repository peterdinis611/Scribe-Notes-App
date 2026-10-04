export { SCRIBE_PLUGIN_API } from '@/lib/plugins/types'
export type {
  PluginApi,
  PluginCategory,
  PluginCommand,
  PluginCommandDefinition,
  PluginExportFormat,
  PluginImportFormat,
  PluginLifecycleEvent,
  PluginManifest,
  PluginModule,
  PluginNlpSkill,
  PluginPermission,
  PluginSettingsPanel,
  PluginSidebarPanel,
  RegisteredPlugin,
} from '@/lib/plugins/types'
export {
  PLUGIN_PRESETS,
  applyPluginPreset,
  presetEnabledCount,
  type PluginPresetId,
} from '@/lib/plugins/presets'
export { PLUGIN_SETUP_EXAMPLES, EXAMPLE_PACKAGE_PATHS } from '@/lib/plugins/examples'
export {
  PLUGIN_CREATE_TEMPLATES,
  buildCreatedPlugin,
  slugifyPluginId,
  validatePluginId,
  type PluginCreateTemplateId,
} from '@/lib/plugins/create'

export { bootstrapPlugins } from '@/lib/plugins/bootstrap'
export { listPluginCommands, getPluginCommand } from '@/lib/plugins/commands'
export {
  getPlugin,
  getPluginsGeneration,
  installPluginFromBytes,
  installPluginRecord,
  listPlugins,
  reloadPlugin,
  setPluginActive,
  subscribePlugins,
  syncEnabledPlugins,
  uninstallPlugin,
} from '@/lib/plugins/registry'
export { isPluginEnabled, setPluginEnabled } from '@/lib/plugins/prefs'
export { createPluginStorage, pluginStorageKey } from '@/lib/plugins/storage'
export { localizeManifestField } from '@/lib/plugins/i18n'
export { listPluginExportFormats } from '@/lib/plugins/surfaces/export-formats'
export { listPluginImportFormats } from '@/lib/plugins/surfaces/import-formats'
export { listPluginSidebarPanels, listPluginSettingsPanels } from '@/lib/plugins/surfaces/ui-panels'
export { listPluginExtensions } from '@/lib/plugins/surfaces/extensions'
export { listPluginNlpSkills } from '@/lib/plugins/surfaces/nlp-skills'
export { listPluginMcpTools, invokePluginMcpTool } from '@/lib/plugins/surfaces/mcp-tools'
export { emitPluginLifecycle } from '@/lib/plugins/surfaces/lifecycle'
export { listPluginLogs, clearPluginLogs, subscribePluginLogs } from '@/lib/plugins/devtools'
export { MARKETPLACE_STATUS, listMarketplaceListings, checkPluginUpdates } from '@/lib/plugins/marketplace'
export { sandboxPolicyFor } from '@/lib/plugins/sandbox'
