import type { PluginCommand, PluginCommandDefinition } from '@/lib/plugins/types'

const byCommandId = new Map<string, PluginCommand>()

export function pluginCommandId(pluginId: string, localId: string): string {
  return `${pluginId}.${localId}`
}

export function registerPluginCommand(
  pluginId: string,
  command: PluginCommandDefinition,
): PluginCommand {
  const localId = command.id.trim()
  if (!localId) throw new Error('Plugin command id is required')
  const commandId = pluginCommandId(pluginId, localId)
  const entry: PluginCommand = {
    ...command,
    id: localId,
    pluginId,
    commandId,
  }
  byCommandId.set(commandId, entry)
  return entry
}

export function unregisterPluginCommand(commandId: string): boolean {
  return byCommandId.delete(commandId)
}

export function unregisterPluginCommandsFor(pluginId: string): number {
  let removed = 0
  for (const [id, command] of [...byCommandId.entries()]) {
    if (command.pluginId === pluginId) {
      byCommandId.delete(id)
      removed += 1
    }
  }
  return removed
}

export function listPluginCommands(): PluginCommand[] {
  return [...byCommandId.values()]
}

export function getPluginCommand(commandId: string): PluginCommand | undefined {
  return byCommandId.get(commandId)
}

/** Test helper — clears the in-memory command registry. */
export function resetPluginCommandsForTests() {
  byCommandId.clear()
}
