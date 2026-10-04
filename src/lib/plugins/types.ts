import type { AnyExtension } from '@tiptap/core'
import type { ReactNode } from 'react'
import type { BlockDefinition } from '@/lib/editor/block-registry'

/** Bump when PluginApi surface changes incompatibly. */
export const SCRIBE_PLUGIN_API = 2 as const

export type PluginPermission =
  | 'editor.blocks'
  | 'editor.extensions'
  | 'commands'
  | 'storage'
  | 'export'
  | 'import'
  | 'ui.sidebar'
  | 'ui.settings'
  | 'nlp.skills'
  | 'mcp.tools'
  | 'lifecycle'

export type PluginI18nTable = Record<string, Record<string, string>>

export type PluginCategory = 'writing' | 'study' | 'workspace' | 'other'

export type PluginManifest = {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  /** Required host API major version (1 or 2 accepted). */
  scribeApi: number
  permissions: PluginPermission[]
  /** When unset, plugin starts disabled until the user enables it. */
  defaultEnabled?: boolean
  /** UI grouping in Settings → Plugins. */
  category?: PluginCategory
  /** Optional translations: `{ en: { "title": "…" }, sk: { "title": "…" } }` */
  i18n?: PluginI18nTable
  main?: string
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

export type PluginExportContext = {
  documentId: string
  title: string
  contentJson: string
}

export type PluginExportFormat = {
  id: string
  label: string
  extensions?: string[]
  export: (ctx: PluginExportContext) => void | Promise<void>
}

export type PluginImportContext = {
  fileName: string
  bytes: Uint8Array
  text?: string
}

export type PluginImportFormat = {
  id: string
  label: string
  extensions: string[]
  import: (ctx: PluginImportContext) => void | Promise<void>
}

export type PluginSidebarPanel = {
  id: string
  title: string
  render: () => ReactNode
}

export type PluginSettingsPanel = {
  id: string
  title: string
  render: () => ReactNode
}

/** Restricted TipTap node spec for untrusted / installed plugins. */
export type PluginNodeSpec = {
  name: string
  group?: string
  inline?: boolean
  atom?: boolean
  selectable?: boolean
  draggable?: boolean
  defining?: boolean
  content?: string
  marks?: string
  attrs?: Record<string, { default?: unknown }>
  parseTag?: string
  renderTag?: string
  renderClass?: string
  textContent?: string
}

export type PluginNlpSkill = {
  id: string
  title: string
  description?: string
  run: (input: { text: string; documentId?: string | null }) => Promise<unknown> | unknown
}

export type PluginMcpTool = {
  id: string
  description: string
  /** Frontend-only handler until scribe-mcp reads the bridge file. */
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown
}

export type PluginLifecycleEvent =
  | { type: 'documentOpen'; documentId: string; title: string }
  | { type: 'documentSave'; documentId: string; title: string }
  | { type: 'selectionChange'; documentId: string | null; empty: boolean; from: number; to: number }

export type PluginLifecycleHandler = (event: PluginLifecycleEvent) => void

export type PluginI18nApi = {
  t: (key: string, fallback?: string) => string
  locale: () => string
}

export type PluginActiveDocument = {
  id: string
  title: string
  contentJson: string
}

export type PluginNotifyApi = {
  success: (title: string, detail?: string) => void
  error: (title: string, detail?: string) => void
  info: (title: string, detail?: string) => void
}

export type PluginAppApi = {
  /** Snapshot of the currently open note (null if none). */
  getActiveDocument: () => PluginActiveDocument | null
}

export type PluginApi = {
  pluginId: string
  i18n: PluginI18nApi
  /** User-visible toasts (also logged to plugin console). */
  notify: PluginNotifyApi
  /** Read-only app context helpers. */
  app: PluginAppApi
  blocks: {
    register: (def: BlockDefinition) => void
    unregister: (id: string) => boolean
  }
  commands: {
    register: (command: PluginCommandDefinition) => void
    unregister: (id: string) => boolean
  }
  storage: PluginStorage
  export: {
    register: (format: PluginExportFormat) => void
    unregister: (id: string) => boolean
  }
  import: {
    register: (format: PluginImportFormat) => void
    unregister: (id: string) => boolean
  }
  ui: {
    registerSidebarPanel: (panel: PluginSidebarPanel) => void
    unregisterSidebarPanel: (id: string) => boolean
    registerSettingsPanel: (panel: PluginSettingsPanel) => void
    unregisterSettingsPanel: (id: string) => boolean
  }
  editor: {
    /** Trusted bundled plugins may register real TipTap extensions. */
    registerExtension: (extension: AnyExtension) => void
    /** Safe node spec → TipTap Node (also for installed plugins). */
    registerNode: (spec: PluginNodeSpec) => void
    unregisterExtension: (name: string) => boolean
  }
  nlp: {
    registerSkill: (skill: PluginNlpSkill) => void
    unregisterSkill: (id: string) => boolean
  }
  mcp: {
    registerTool: (tool: PluginMcpTool) => void
    unregisterTool: (id: string) => boolean
  }
  lifecycle: {
    on: (handler: PluginLifecycleHandler) => () => void
  }
  /** Devtools log line (also buffered for Settings → Plugins). */
  log: (message: string, level?: 'info' | 'warn' | 'error') => void
}

export type PluginCleanup = () => void

export type PluginModule = {
  manifest: PluginManifest
  activate: (api: PluginApi) => void | PluginCleanup | Promise<void | PluginCleanup>
}

export type PluginSource = 'bundled' | 'installed'

export type RegisteredPlugin = {
  manifest: PluginManifest
  source: PluginSource
  module: PluginModule
  active: boolean
  error?: string
  /** Absolute path or install id for disk-installed packages. */
  installPath?: string
}

export type InstalledPluginRecord = {
  manifest: PluginManifest
  code: string
  installedAt: string
  path?: string
}
