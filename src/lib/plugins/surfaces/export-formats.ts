import { createOwnedRegistry } from '@/lib/plugins/surfaces/registry-map'
import type { PluginExportFormat } from '@/lib/plugins/types'

const registry = createOwnedRegistry<PluginExportFormat>('export format')

export function registerPluginExportFormat(pluginId: string, format: PluginExportFormat) {
  return registry.register(pluginId, format)
}

export function unregisterPluginExportFormat(pluginId: string, id: string) {
  return registry.unregister(pluginId, id)
}

export function unregisterPluginExportFormatsFor(pluginId: string) {
  return registry.unregisterAll(pluginId)
}

export function listPluginExportFormats() {
  return registry.list()
}

export function resetPluginExportFormatsForTests() {
  registry.clear()
}
