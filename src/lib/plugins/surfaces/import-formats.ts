import { createOwnedRegistry } from '@/lib/plugins/surfaces/registry-map'
import type { PluginImportFormat } from '@/lib/plugins/types'

const registry = createOwnedRegistry<PluginImportFormat>('import format')

export function registerPluginImportFormat(pluginId: string, format: PluginImportFormat) {
  return registry.register(pluginId, format)
}

export function unregisterPluginImportFormat(pluginId: string, id: string) {
  return registry.unregister(pluginId, id)
}

export function unregisterPluginImportFormatsFor(pluginId: string) {
  return registry.unregisterAll(pluginId)
}

export function listPluginImportFormats() {
  return registry.list()
}

export function resetPluginImportFormatsForTests() {
  registry.clear()
}
