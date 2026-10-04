export type PluginLogLevel = 'info' | 'warn' | 'error'

export type PluginLogEntry = {
  id: string
  pluginId: string
  level: PluginLogLevel
  message: string
  at: string
}

const MAX_LOGS = 200
const logs: PluginLogEntry[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function pluginLog(
  pluginId: string,
  message: string,
  level: PluginLogLevel = 'info',
) {
  logs.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pluginId,
    level,
    message: String(message).slice(0, 2000),
    at: new Date().toISOString(),
  })
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS
  if (level === 'error') console.error(`[plugin:${pluginId}]`, message)
  else if (level === 'warn') console.warn(`[plugin:${pluginId}]`, message)
  else console.info(`[plugin:${pluginId}]`, message)
  emit()
}

export function listPluginLogs(pluginId?: string): PluginLogEntry[] {
  if (!pluginId) return [...logs]
  return logs.filter((entry) => entry.pluginId === pluginId)
}

export function clearPluginLogs(pluginId?: string) {
  if (!pluginId) {
    logs.length = 0
  } else {
    for (let i = logs.length - 1; i >= 0; i -= 1) {
      if (logs[i].pluginId === pluginId) logs.splice(i, 1)
    }
  }
  emit()
}

export function subscribePluginLogs(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetPluginDevtoolsForTests() {
  logs.length = 0
}
