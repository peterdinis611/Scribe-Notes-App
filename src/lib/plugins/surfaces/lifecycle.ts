import type { PluginLifecycleEvent, PluginLifecycleHandler } from '@/lib/plugins/types'

type OwnedHandler = {
  pluginId: string
  handler: PluginLifecycleHandler
}

const handlers = new Set<OwnedHandler>()

const lastSelectionAt = new Map<string, number>()
const SELECTION_THROTTLE_MS = 250
const lastSaveAt = new Map<string, number>()
const SAVE_THROTTLE_MS = 800

export function registerPluginLifecycleHandler(pluginId: string, handler: PluginLifecycleHandler) {
  const entry: OwnedHandler = { pluginId, handler }
  handlers.add(entry)
  return () => {
    handlers.delete(entry)
  }
}

export function unregisterPluginLifecycleHandlersFor(pluginId: string) {
  for (const entry of [...handlers]) {
    if (entry.pluginId === pluginId) handlers.delete(entry)
  }
}

export function emitPluginLifecycle(event: PluginLifecycleEvent) {
  if (event.type === 'selectionChange') {
    const key = event.documentId ?? '__none__'
    const now = Date.now()
    const prev = lastSelectionAt.get(key) ?? 0
    if (now - prev < SELECTION_THROTTLE_MS) return
    lastSelectionAt.set(key, now)
  }
  if (event.type === 'documentSave') {
    const now = Date.now()
    const prev = lastSaveAt.get(event.documentId) ?? 0
    if (now - prev < SAVE_THROTTLE_MS) return
    lastSaveAt.set(event.documentId, now)
  }

  for (const entry of handlers) {
    try {
      entry.handler(event)
    } catch (error) {
      console.warn('[plugins] lifecycle handler failed', entry.pluginId, error)
    }
  }
}

export function resetPluginLifecycleForTests() {
  handlers.clear()
  lastSelectionAt.clear()
  lastSaveAt.clear()
}
