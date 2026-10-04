import { createPluginHost } from '@/lib/plugins/host'
import {
  listInstalledPluginRecords,
  loadPluginModuleFromCode,
  parseScribeExtBytes,
  removeInstalledPluginRecord,
  saveInstalledPluginRecord,
} from '@/lib/plugins/install'
import { isPluginEnabled, setPluginEnabled } from '@/lib/plugins/prefs'
import {
  SCRIBE_PLUGIN_API,
  type InstalledPluginRecord,
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

function assertApi(manifestId: string, scribeApi: number) {
  if (scribeApi !== 1 && scribeApi !== SCRIBE_PLUGIN_API) {
    throw new Error(
      `Plugin "${manifestId}" requires scribeApi ${scribeApi}, host is ${SCRIBE_PLUGIN_API}`,
    )
  }
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
  if (!manifest.id?.trim()) throw new Error('Plugin manifest id is required')
  assertApi(manifest.id, manifest.scribeApi)

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

export function registerInstalledPlugin(
  module: PluginModule,
  meta?: { installPath?: string },
): RegisteredPlugin {
  const { manifest } = module
  if (!manifest.id?.trim()) throw new Error('Plugin manifest id is required')
  assertApi(manifest.id, manifest.scribeApi)

  const existing = plugins.get(manifest.id)
  if (existing?.active) {
    deactivatePlugin(manifest.id)
  }

  const entry: RegisteredPlugin = {
    manifest,
    source: 'installed',
    module,
    active: false,
    installPath: meta?.installPath,
  }
  plugins.set(manifest.id, entry)
  emit()
  return entry
}

async function activatePlugin(pluginId: string): Promise<void> {
  const entry = plugins.get(pluginId)
  if (!entry || entry.active) return

  const host = createPluginHost(entry.manifest, entry.source)
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

export async function installPluginRecord(
  record: InstalledPluginRecord,
  options?: { enable?: boolean },
): Promise<RegisteredPlugin> {
  const module = await loadPluginModuleFromCode(record.manifest, record.code)
  saveInstalledPluginRecord(record)
  const entry = registerInstalledPlugin(module, { installPath: record.path })
  const enable = options?.enable !== false
  setPluginEnabled(record.manifest.id, enable)
  if (enable) {
    await activatePlugin(record.manifest.id)
  }
  return entry
}

export async function installPluginFromBytes(
  bytes: Uint8Array,
  pathHint?: string,
): Promise<RegisteredPlugin> {
  const record = await parseScribeExtBytes(bytes, pathHint)
  return installPluginRecord(record)
}

export async function uninstallPlugin(pluginId: string): Promise<void> {
  const entry = plugins.get(pluginId)
  if (!entry) return
  if (entry.source !== 'installed') {
    throw new Error('Only installed plugins can be uninstalled')
  }
  deactivatePlugin(pluginId)
  plugins.delete(pluginId)
  removeInstalledPluginRecord(pluginId)
  emit()
}

/** Hot-reload an installed plugin from its stored code (devtools). */
export async function reloadPlugin(pluginId: string): Promise<void> {
  const entry = plugins.get(pluginId)
  if (!entry) throw new Error(`Unknown plugin: ${pluginId}`)
  const wasEnabled = isPluginEnabled(pluginId, entry.manifest.defaultEnabled === true)
  deactivatePlugin(pluginId)

  if (entry.source === 'installed') {
    const record = listInstalledPluginRecords().find((item) => item.manifest.id === pluginId)
    if (!record) throw new Error('Installed plugin record missing')
    const module = await loadPluginModuleFromCode(record.manifest, record.code)
    entry.module = module
    entry.manifest = module.manifest
  }

  if (wasEnabled) await activatePlugin(pluginId)
  else emit()
}

export async function hydrateInstalledPlugins(): Promise<void> {
  for (const record of listInstalledPluginRecords()) {
    try {
      const module = await loadPluginModuleFromCode(record.manifest, record.code)
      registerInstalledPlugin(module, { installPath: record.path })
    } catch (error) {
      console.error('[plugins] failed to hydrate installed plugin', record.manifest.id, error)
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
