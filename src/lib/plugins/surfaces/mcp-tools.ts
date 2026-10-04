import { createOwnedRegistry } from '@/lib/plugins/surfaces/registry-map'
import type { PluginMcpTool } from '@/lib/plugins/types'
import { kvSetJson } from '@/lib/storage/kv'

const registry = createOwnedRegistry<PluginMcpTool>('mcp tool')

const BRIDGE_KEY = 'scribe-plugin-mcp-bridge'

function persistBridge() {
  const tools = registry.list().map((tool) => ({
    id: `${tool.pluginId}.${tool.id}`,
    pluginId: tool.pluginId,
    description: tool.description,
  }))
  kvSetJson(BRIDGE_KEY, { v: 1, tools, updatedAt: new Date().toISOString() })
}

export function registerPluginMcpTool(pluginId: string, tool: PluginMcpTool) {
  const id = registry.register(pluginId, tool)
  persistBridge()
  return id
}

export function unregisterPluginMcpTool(pluginId: string, id: string) {
  const ok = registry.unregister(pluginId, id)
  persistBridge()
  return ok
}

export function unregisterPluginMcpToolsFor(pluginId: string) {
  const n = registry.unregisterAll(pluginId)
  persistBridge()
  return n
}

export function listPluginMcpTools() {
  return registry.list()
}

export async function invokePluginMcpTool(
  fullId: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const tool = registry.list().find((entry) => `${entry.pluginId}.${entry.id}` === fullId)
  if (!tool) throw new Error(`Unknown plugin MCP tool: ${fullId}`)
  return tool.handler(args)
}

export function resetPluginMcpToolsForTests() {
  registry.clear()
  persistBridge()
}
