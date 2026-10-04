import { createOwnedRegistry } from '@/lib/plugins/surfaces/registry-map'
import type { PluginNlpSkill } from '@/lib/plugins/types'

const registry = createOwnedRegistry<PluginNlpSkill>('nlp skill')

export function registerPluginNlpSkill(pluginId: string, skill: PluginNlpSkill) {
  return registry.register(pluginId, skill)
}

export function unregisterPluginNlpSkill(pluginId: string, id: string) {
  return registry.unregister(pluginId, id)
}

export function unregisterPluginNlpSkillsFor(pluginId: string) {
  return registry.unregisterAll(pluginId)
}

export function listPluginNlpSkills() {
  return registry.list()
}

export function resetPluginNlpSkillsForTests() {
  registry.clear()
}
