import { listPluginCommands } from '@/lib/plugins/commands'
import { listPluginExportFormats } from '@/lib/plugins/surfaces/export-formats'
import { listPluginImportFormats } from '@/lib/plugins/surfaces/import-formats'
import { listPluginMcpTools } from '@/lib/plugins/surfaces/mcp-tools'
import { listPluginNlpSkills } from '@/lib/plugins/surfaces/nlp-skills'
import { listPluginSettingsPanels, listPluginSidebarPanels } from '@/lib/plugins/surfaces/ui-panels'
import { listPluginExtensionEntries } from '@/lib/plugins/surfaces/extensions'

export type PluginBlockContribution = {
  pluginId: string
  id: string
  label?: string
}

const blockContributions = new Map<string, PluginBlockContribution>()

function blockKey(pluginId: string, id: string) {
  return `${pluginId}:${id}`
}

export function trackPluginBlock(pluginId: string, id: string, label?: string) {
  blockContributions.set(blockKey(pluginId, id), { pluginId, id, label })
}

export function untrackPluginBlock(pluginId: string, id: string) {
  return blockContributions.delete(blockKey(pluginId, id))
}

export function untrackPluginBlocksFor(pluginId: string) {
  let n = 0
  for (const [key, value] of [...blockContributions.entries()]) {
    if (value.pluginId === pluginId) {
      blockContributions.delete(key)
      n += 1
    }
  }
  return n
}

export type PluginContributions = {
  pluginId: string
  commands: Array<{ id: string; title: string; commandId: string }>
  blocks: PluginBlockContribution[]
  nodes: Array<{ id: string; name: string }>
  exports: Array<{ id: string; label: string }>
  imports: Array<{ id: string; label: string }>
  sidebar: Array<{ id: string; title: string }>
  settings: Array<{ id: string; title: string }>
  nlp: Array<{ id: string; title: string }>
  mcp: Array<{ id: string; description: string }>
  total: number
}

export function listPluginContributions(pluginId: string): PluginContributions {
  const commands = listPluginCommands()
    .filter((item) => item.pluginId === pluginId)
    .map((item) => ({ id: item.id, title: item.title, commandId: item.commandId }))
  const blocks = [...blockContributions.values()].filter((item) => item.pluginId === pluginId)
  const nodes = listPluginExtensionEntries()
    .filter((item) => item.pluginId === pluginId)
    .map((item) => ({ id: item.name, name: item.name }))
  const exports = listPluginExportFormats()
    .filter((item) => item.pluginId === pluginId)
    .map((item) => ({ id: item.id, label: item.label }))
  const imports = listPluginImportFormats()
    .filter((item) => item.pluginId === pluginId)
    .map((item) => ({ id: item.id, label: item.label }))
  const sidebar = listPluginSidebarPanels()
    .filter((item) => item.pluginId === pluginId)
    .map((item) => ({ id: item.id, title: item.title }))
  const settings = listPluginSettingsPanels()
    .filter((item) => item.pluginId === pluginId)
    .map((item) => ({ id: item.id, title: item.title }))
  const nlp = listPluginNlpSkills()
    .filter((item) => item.pluginId === pluginId)
    .map((item) => ({ id: item.id, title: item.title }))
  const mcp = listPluginMcpTools()
    .filter((item) => item.pluginId === pluginId)
    .map((item) => ({ id: item.id, description: item.description }))

  const total =
    commands.length +
    blocks.length +
    nodes.length +
    exports.length +
    imports.length +
    sidebar.length +
    settings.length +
    nlp.length +
    mcp.length

  return {
    pluginId,
    commands,
    blocks,
    nodes,
    exports,
    imports,
    sidebar,
    settings,
    nlp,
    mcp,
    total,
  }
}

export function resetPluginContributionsForTests() {
  blockContributions.clear()
}
