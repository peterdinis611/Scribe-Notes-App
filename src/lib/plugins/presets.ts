/**
 * First-party plugin presets — enable/disable a recommended set at once.
 */

import { listPlugins, setPluginActive } from '@/lib/plugins/registry'
import { isPluginEnabled } from '@/lib/plugins/prefs'
import type { PluginCategory } from '@/lib/plugins/types'

export type PluginPresetId = 'writing' | 'study' | 'workspace' | 'all'

export type PluginPreset = {
  id: PluginPresetId
  /** i18n key under settings.plugins.presets.<id> */
  pluginIds: string[]
}

export const PLUGIN_PRESETS: PluginPreset[] = [
  {
    id: 'writing',
    pluginIds: [
      'scribe.daily-journal',
      'scribe.meeting-wrap',
      'scribe.plaintext-export',
    ],
  },
  {
    id: 'study',
    pluginIds: ['scribe.flashcards', 'scribe.citation-pack'],
  },
  {
    id: 'workspace',
    pluginIds: ['scribe.status-meta', 'scribe.theme-pack'],
  },
  {
    id: 'all',
    pluginIds: [
      'scribe.daily-journal',
      'scribe.meeting-wrap',
      'scribe.plaintext-export',
      'scribe.flashcards',
      'scribe.citation-pack',
      'scribe.status-meta',
      'scribe.theme-pack',
      'scribe.standup',
    ],
  },
]

export function categoryForPluginId(pluginId: string): PluginCategory {
  if (PLUGIN_PRESETS.find((p) => p.id === 'writing')?.pluginIds.includes(pluginId)) {
    return 'writing'
  }
  if (PLUGIN_PRESETS.find((p) => p.id === 'study')?.pluginIds.includes(pluginId)) {
    return 'study'
  }
  if (PLUGIN_PRESETS.find((p) => p.id === 'workspace')?.pluginIds.includes(pluginId)) {
    return 'workspace'
  }
  return 'other'
}

export function getPreset(id: PluginPresetId): PluginPreset | undefined {
  return PLUGIN_PRESETS.find((preset) => preset.id === id)
}

export function presetEnabledCount(preset: PluginPreset): { enabled: number; total: number } {
  const known = listPlugins()
  const ids = preset.pluginIds.filter((id) => known.some((p) => p.manifest.id === id))
  let enabled = 0
  for (const id of ids) {
    const plugin = known.find((p) => p.manifest.id === id)
    if (!plugin) continue
    if (isPluginEnabled(id, plugin.manifest.defaultEnabled === true)) enabled += 1
  }
  return { enabled, total: ids.length }
}

/** Enable or disable every plugin in a preset that is registered. */
export async function applyPluginPreset(id: PluginPresetId, enabled: boolean): Promise<number> {
  const preset = getPreset(id)
  if (!preset) return 0
  let changed = 0
  for (const pluginId of preset.pluginIds) {
    if (!listPlugins().some((p) => p.manifest.id === pluginId)) continue
    await setPluginActive(pluginId, enabled)
    changed += 1
  }
  return changed
}
