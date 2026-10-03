import {
  registerBlock,
  unregisterBlock,
  type BlockDefinition,
} from '@/lib/editor/block-registry'
import {
  pluginCommandId,
  registerPluginCommand,
  unregisterPluginCommand,
} from '@/lib/plugins/commands'
import { createPluginStorage } from '@/lib/plugins/storage'
import type {
  PluginApi,
  PluginCleanup,
  PluginCommandDefinition,
  PluginManifest,
  PluginPermission,
} from '@/lib/plugins/types'

export class PluginPermissionError extends Error {
  readonly permission: PluginPermission

  constructor(permission: PluginPermission, pluginId: string) {
    super(`Plugin "${pluginId}" lacks permission "${permission}"`)
    this.name = 'PluginPermissionError'
    this.permission = permission
  }
}

type HostSession = {
  api: PluginApi
  cleanup: PluginCleanup
}

function hasPermission(manifest: PluginManifest, permission: PluginPermission): boolean {
  return manifest.permissions.includes(permission)
}

export function createPluginHost(manifest: PluginManifest): HostSession {
  const registeredBlockIds = new Set<string>()
  const registeredCommandIds = new Set<string>()

  function requirePermission(permission: PluginPermission) {
    if (!hasPermission(manifest, permission)) {
      throw new PluginPermissionError(permission, manifest.id)
    }
  }

  const api: PluginApi = {
    pluginId: manifest.id,
    blocks: {
      register(def: BlockDefinition) {
        requirePermission('editor.blocks')
        registerBlock(def)
        registeredBlockIds.add(def.id)
      },
      unregister(id: string) {
        requirePermission('editor.blocks')
        const ok = unregisterBlock(id)
        registeredBlockIds.delete(id)
        return ok
      },
    },
    commands: {
      register(command: PluginCommandDefinition) {
        requirePermission('commands')
        const entry = registerPluginCommand(manifest.id, command)
        registeredCommandIds.add(entry.commandId)
      },
      unregister(id: string) {
        requirePermission('commands')
        const commandId = pluginCommandId(manifest.id, id)
        const ok = unregisterPluginCommand(commandId)
        registeredCommandIds.delete(commandId)
        return ok
      },
    },
    storage: createPluginStorage(manifest.id),
  }

  // Storage is always namespaced; still require the permission to use it.
  if (!hasPermission(manifest, 'storage')) {
    api.storage = {
      get() {
        throw new PluginPermissionError('storage', manifest.id)
      },
      set() {
        throw new PluginPermissionError('storage', manifest.id)
      },
      remove() {
        throw new PluginPermissionError('storage', manifest.id)
      },
      getJson() {
        throw new PluginPermissionError('storage', manifest.id)
      },
      setJson() {
        throw new PluginPermissionError('storage', manifest.id)
      },
    }
  }

  const cleanup: PluginCleanup = () => {
    for (const blockId of registeredBlockIds) {
      unregisterBlock(blockId)
    }
    registeredBlockIds.clear()
    for (const commandId of registeredCommandIds) {
      unregisterPluginCommand(commandId)
    }
    registeredCommandIds.clear()
  }

  return { api, cleanup }
}
