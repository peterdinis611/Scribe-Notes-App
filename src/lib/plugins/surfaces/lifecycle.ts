import { Throttler } from '@/lib/pacer'
import type { PluginLifecycleEvent, PluginLifecycleHandler } from '@/lib/plugins/types'

type OwnedHandler = {
  pluginId: string
  handler: PluginLifecycleHandler
}

const handlers = new Set<OwnedHandler>()

const SELECTION_THROTTLE_MS = 250
const SAVE_THROTTLE_MS = 800

const selectionThrottlers = new Map<string, Throttler<(event: PluginLifecycleEvent) => void>>()
const saveThrottlers = new Map<string, Throttler<(event: PluginLifecycleEvent) => void>>()

function dispatchLifecycle(event: PluginLifecycleEvent) {
  for (const entry of handlers) {
    try {
      entry.handler(event)
    } catch (error) {
      console.warn('[plugins] lifecycle handler failed', entry.pluginId, error)
    }
  }
}

function getSelectionThrottler(key: string) {
  let throttler = selectionThrottlers.get(key)
  if (!throttler) {
    // Match prior behavior: fire immediately, drop extras in the window.
    throttler = new Throttler(dispatchLifecycle, {
      wait: SELECTION_THROTTLE_MS,
      leading: true,
      trailing: false,
    })
    selectionThrottlers.set(key, throttler)
  }
  return throttler
}

function getSaveThrottler(documentId: string) {
  let throttler = saveThrottlers.get(documentId)
  if (!throttler) {
    throttler = new Throttler(dispatchLifecycle, {
      wait: SAVE_THROTTLE_MS,
      leading: true,
      trailing: false,
    })
    saveThrottlers.set(documentId, throttler)
  }
  return throttler
}

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
    getSelectionThrottler(event.documentId ?? '__none__').maybeExecute(event)
    return
  }
  if (event.type === 'documentSave') {
    getSaveThrottler(event.documentId).maybeExecute(event)
    return
  }

  dispatchLifecycle(event)
}

export function resetPluginLifecycleForTests() {
  handlers.clear()
  for (const throttler of selectionThrottlers.values()) throttler.cancel()
  for (const throttler of saveThrottlers.values()) throttler.cancel()
  selectionThrottlers.clear()
  saveThrottlers.clear()
}
