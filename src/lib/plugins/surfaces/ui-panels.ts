import { createOwnedRegistry } from '@/lib/plugins/surfaces/registry-map'
import type { PluginSettingsPanel, PluginSidebarPanel } from '@/lib/plugins/types'

const sidebar = createOwnedRegistry<PluginSidebarPanel>('sidebar panel')
const settings = createOwnedRegistry<PluginSettingsPanel>('settings panel')

export function registerPluginSidebarPanel(pluginId: string, panel: PluginSidebarPanel) {
  return sidebar.register(pluginId, panel)
}

export function unregisterPluginSidebarPanel(pluginId: string, id: string) {
  return sidebar.unregister(pluginId, id)
}

export function unregisterPluginSidebarPanelsFor(pluginId: string) {
  return sidebar.unregisterAll(pluginId)
}

export function listPluginSidebarPanels() {
  return sidebar.list()
}

export function registerPluginSettingsPanel(pluginId: string, panel: PluginSettingsPanel) {
  return settings.register(pluginId, panel)
}

export function unregisterPluginSettingsPanel(pluginId: string, id: string) {
  return settings.unregister(pluginId, id)
}

export function unregisterPluginSettingsPanelsFor(pluginId: string) {
  return settings.unregisterAll(pluginId)
}

export function listPluginSettingsPanels() {
  return settings.list()
}

export function resetPluginUiPanelsForTests() {
  sidebar.clear()
  settings.clear()
}
