import { kvGetJson, kvSetJson } from '@/lib/storage/kv'

export const PLUGIN_ENABLED_KEY = 'scribe-plugins-enabled'

type EnabledMap = Record<string, boolean>

function readMap(): EnabledMap {
  const stored = kvGetJson<EnabledMap>(PLUGIN_ENABLED_KEY)
  if (!stored || typeof stored !== 'object') return {}
  const next: EnabledMap = {}
  for (const [id, value] of Object.entries(stored)) {
    if (typeof value === 'boolean') next[id] = value
  }
  return next
}

export function getPluginEnabledOverride(pluginId: string): boolean | undefined {
  const map = readMap()
  return Object.prototype.hasOwnProperty.call(map, pluginId) ? map[pluginId] : undefined
}

export function setPluginEnabled(pluginId: string, enabled: boolean) {
  const map = readMap()
  map[pluginId] = enabled
  kvSetJson(PLUGIN_ENABLED_KEY, map)
}

/** Resolve enablement: explicit override → manifest default → false. */
export function isPluginEnabled(pluginId: string, defaultEnabled = false): boolean {
  const override = getPluginEnabledOverride(pluginId)
  if (override !== undefined) return override
  return defaultEnabled
}
