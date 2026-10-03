import { createPluginHost } from '@/lib/plugins/host'
import { isPluginEnabled, setPluginEnabled } from '@/lib/plugins/prefs'
import {
  SCRIBE_PLUGIN_API,
  type PluginCleanup,
  type PluginModule,
  type RegisteredPlugin,
} from '@/lib/plugins/types'

const plugins = new Map<string, RegisteredPlugin>()
const cleanups = new Map<string, PluginCleanup>()
const listeners = new Set<() => void>()

let generation = 0

function emit() {
  generation += 1
  for (const listener of listeners) listener()
}

export function subscribePlugins(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getPluginsGeneration(): number {
  return generation
}

export function listPlugins(): RegisteredPlugin[] {
  return [...plugins.values()].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
}

export function getPlugin(pluginId: string): RegisteredPlugin | undefined {
  return plugins.get(pluginId)
}

export function registerBundledPlugin(module: PluginModule): RegisteredPlugin {
  const { manifest } = module
  if (!manifest.id?.trim()) {
    throw new Error('Plugin manifest id is required')
  }
  if (manifest.scribeApi !== SCRIBE_PLUGIN_API) {
    throw new Error(
      `Plugin "${manifest.id}" requires scribeApi ${manifest.scribeApi}, host is ${SCRIBE_PLUGIN_API}`,
    )
  }

  const entry: RegisteredPlugin = {
    manifest,
    source: 'bundled',
    module,
    active: false,
  }
  plugins.set(manifest.id, entry)
  emit()
  return entry
}

async function activatePlugin(pluginId: string): Promise<void> {
  const entry = plugins.get(pluginId)
  if (!entry || entry.active) return

  const host = createPluginHost(entry.manifest)
  try {
    const result = await entry.module.activate(host.api)
    const userCleanup = typeof result === 'function' ? result : undefined
    cleanups.set(pluginId, () => {
      try {
        userCleanup?.()
      } finally {
        host.cleanup()
      }
    })
    entry.active = true
    entry.error = undefined
  } catch (error) {
    host.cleanup()
    entry.active = false
    entry.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    emit()
  }
}

function deactivatePlugin(pluginId: string) {
  const entry = plugins.get(pluginId)
  if (!entry) return
  const cleanup = cleanups.get(pluginId)
  cleanup?.()
  cleanups.delete(pluginId)
  if (entry.active) {
    entry.active = false
    emit()
  }
}

export async function setPluginActive(pluginId: string, enabled: boolean): Promise<void> {
  const entry = plugins.get(pluginId)
  if (!entry) throw new Error(`Unknown plugin: ${pluginId}`)

  setPluginEnabled(pluginId, enabled)
  if (enabled) {
    await activatePlugin(pluginId)
  } else {
    deactivatePlugin(pluginId)
  }
}

export async function syncEnabledPlugins(): Promise<void> {
  for (const entry of plugins.values()) {
    const shouldEnable = isPluginEnabled(entry.manifest.id, entry.manifest.defaultEnabled === true)
    if (shouldEnable && !entry.active) {
      try {
        await activatePlugin(entry.manifest.id)
      } catch {
        // Kept on entry.error; continue activating others.
      }
    } else if (!shouldEnable && entry.active) {
      deactivatePlugin(entry.manifest.id)
    }
  }
}

export function resetPluginsForTests() {
  for (const id of [...cleanups.keys()]) {
    deactivatePlugin(id)
  }
  plugins.clear()
  cleanups.clear()
  generation = 0
  emit()
}
