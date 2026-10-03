import type { BlockDefinition } from '@/lib/editor/block-registry'

/** Bump when PluginApi surface changes incompatibly. */
export const SCRIBE_PLUGIN_API = 1 as const

export type PluginPermission = 'editor.blocks' | 'commands' | 'storage'

export type PluginManifest = {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  /** Required host API major version. */
  scribeApi: number
  permissions: PluginPermission[]
  /** When unset, plugin starts disabled until the user enables it. */
  defaultEnabled?: boolean
}

export type PluginCommandDefinition = {
  /** Local id; host prefixes with `pluginId.` for the palette. */
  id: string
  title: string
  hint?: string
  keywords?: string[]
  run: () => void | Promise<void>
}

export type PluginCommand = PluginCommandDefinition & {
  pluginId: string
  /** Fully-qualified id: `${pluginId}.${id}` */
  commandId: string
}

export type PluginStorage = {
  get: (key: string) => string | null
  set: (key: string, value: string) => void
  remove: (key: string) => void
  getJson: <T>(key: string) => T | null
  setJson: (key: string, value: unknown) => void
}

export type PluginApi = {
  pluginId: string
  blocks: {
    register: (def: BlockDefinition) => void
    unregister: (id: string) => boolean
  }
  commands: {
    register: (command: PluginCommandDefinition) => void
    unregister: (id: string) => boolean
  }
  storage: PluginStorage
}

export type PluginCleanup = () => void

export type PluginModule = {
  manifest: PluginManifest
  activate: (api: PluginApi) => void | PluginCleanup | Promise<void | PluginCleanup>
}

export type RegisteredPlugin = {
  manifest: PluginManifest
  source: 'bundled'
  module: PluginModule
  active: boolean
  error?: string
}
