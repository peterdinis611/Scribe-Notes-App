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
import {
  trackPluginBlock,
  untrackPluginBlock,
  untrackPluginBlocksFor,
} from '@/lib/plugins/contributions'
import { pluginLog } from '@/lib/plugins/devtools'
import { createPluginI18n } from '@/lib/plugins/i18n'
import { isPermissionAllowed } from '@/lib/plugins/sandbox'
import { createPluginStorage } from '@/lib/plugins/storage'
import {
  registerPluginExtension,
  registerPluginNodeSpec,
  unregisterPluginExtension,
  unregisterPluginExtensionsFor,
} from '@/lib/plugins/surfaces/extensions'
import {
  registerPluginExportFormat,
  unregisterPluginExportFormat,
  unregisterPluginExportFormatsFor,
} from '@/lib/plugins/surfaces/export-formats'
import {
  registerPluginImportFormat,
  unregisterPluginImportFormat,
  unregisterPluginImportFormatsFor,
} from '@/lib/plugins/surfaces/import-formats'
import {
  registerPluginLifecycleHandler,
  unregisterPluginLifecycleHandlersFor,
} from '@/lib/plugins/surfaces/lifecycle'
import {
  registerPluginMcpTool,
  unregisterPluginMcpTool,
  unregisterPluginMcpToolsFor,
} from '@/lib/plugins/surfaces/mcp-tools'
import {
  registerPluginNlpSkill,
  unregisterPluginNlpSkill,
  unregisterPluginNlpSkillsFor,
} from '@/lib/plugins/surfaces/nlp-skills'
import {
  registerPluginSettingsPanel,
  registerPluginSidebarPanel,
  unregisterPluginSettingsPanel,
  unregisterPluginSettingsPanelsFor,
  unregisterPluginSidebarPanel,
  unregisterPluginSidebarPanelsFor,
} from '@/lib/plugins/surfaces/ui-panels'
import type {
  PluginApi,
  PluginCleanup,
  PluginCommandDefinition,
  PluginExportFormat,
  PluginImportFormat,
  PluginManifest,
  PluginMcpTool,
  PluginNlpSkill,
  PluginNodeSpec,
  PluginPermission,
  PluginSettingsPanel,
  PluginSidebarPanel,
  PluginSource,
} from '@/lib/plugins/types'
import type { AnyExtension } from '@tiptap/core'
import { toast } from '@/lib/toast'
import { store } from '@/store/index'

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

export function createPluginHost(
  manifest: PluginManifest,
  source: PluginSource = 'bundled',
): HostSession {
  const registeredBlockIds = new Set<string>()
  const registeredCommandIds = new Set<string>()
  const lifecycleUnsubs: Array<() => void> = []

  function requirePermission(permission: PluginPermission) {
    if (!isPermissionAllowed(source, permission, manifest.permissions)) {
      throw new PluginPermissionError(permission, manifest.id)
    }
  }

  const storage = createPluginStorage(manifest.id)
  const deniedStorage: PluginApi['storage'] = {
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

  const api: PluginApi = {
    pluginId: manifest.id,
    i18n: createPluginI18n(manifest),
    notify: {
      success(title, detail) {
        pluginLog(manifest.id, detail ? `${title}: ${detail}` : title, 'info')
        toast.success(title, detail)
      },
      error(title, detail) {
        pluginLog(manifest.id, detail ? `${title}: ${detail}` : title, 'error')
        toast.error(title, detail)
      },
      info(title, detail) {
        pluginLog(manifest.id, detail ? `${title}: ${detail}` : title, 'info')
        toast.info(title, detail)
      },
    },
    app: {
      getActiveDocument() {
        const doc = store.getState().documents.activeDocument
        if (!doc) return null
        return { id: doc.id, title: doc.title, contentJson: doc.contentJson }
      },
    },
    blocks: {
      register(def: BlockDefinition) {
        requirePermission('editor.blocks')
        registerBlock(def)
        registeredBlockIds.add(def.id)
        trackPluginBlock(manifest.id, def.id, def.label)
      },
      unregister(id: string) {
        requirePermission('editor.blocks')
        const ok = unregisterBlock(id)
        registeredBlockIds.delete(id)
        untrackPluginBlock(manifest.id, id)
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
    storage: isPermissionAllowed(source, 'storage', manifest.permissions)
      ? storage
      : deniedStorage,
    export: {
      register(format: PluginExportFormat) {
        requirePermission('export')
        registerPluginExportFormat(manifest.id, format)
      },
      unregister(id: string) {
        requirePermission('export')
        return unregisterPluginExportFormat(manifest.id, id)
      },
    },
    import: {
      register(format: PluginImportFormat) {
        requirePermission('import')
        registerPluginImportFormat(manifest.id, format)
      },
      unregister(id: string) {
        requirePermission('import')
        return unregisterPluginImportFormat(manifest.id, id)
      },
    },
    ui: {
      registerSidebarPanel(panel: PluginSidebarPanel) {
        requirePermission('ui.sidebar')
        registerPluginSidebarPanel(manifest.id, panel)
      },
      unregisterSidebarPanel(id: string) {
        requirePermission('ui.sidebar')
        return unregisterPluginSidebarPanel(manifest.id, id)
      },
      registerSettingsPanel(panel: PluginSettingsPanel) {
        requirePermission('ui.settings')
        registerPluginSettingsPanel(manifest.id, panel)
      },
      unregisterSettingsPanel(id: string) {
        requirePermission('ui.settings')
        return unregisterPluginSettingsPanel(manifest.id, id)
      },
    },
    editor: {
      registerExtension(extension: AnyExtension) {
        requirePermission('editor.extensions')
        registerPluginExtension(manifest.id, extension)
      },
      registerNode(spec: PluginNodeSpec) {
        // Safe path: allowed with editor.blocks OR editor.extensions
        if (
          !isPermissionAllowed(source, 'editor.extensions', manifest.permissions) &&
          !isPermissionAllowed(source, 'editor.blocks', manifest.permissions)
        ) {
          throw new PluginPermissionError('editor.blocks', manifest.id)
        }
        registerPluginNodeSpec(manifest.id, spec)
      },
      unregisterExtension(name: string) {
        return unregisterPluginExtension(manifest.id, name)
      },
    },
    nlp: {
      registerSkill(skill: PluginNlpSkill) {
        requirePermission('nlp.skills')
        registerPluginNlpSkill(manifest.id, skill)
      },
      unregisterSkill(id: string) {
        requirePermission('nlp.skills')
        return unregisterPluginNlpSkill(manifest.id, id)
      },
    },
    mcp: {
      registerTool(tool: PluginMcpTool) {
        requirePermission('mcp.tools')
        registerPluginMcpTool(manifest.id, tool)
      },
      unregisterTool(id: string) {
        requirePermission('mcp.tools')
        return unregisterPluginMcpTool(manifest.id, id)
      },
    },
    lifecycle: {
      on(handler) {
        requirePermission('lifecycle')
        const unsub = registerPluginLifecycleHandler(manifest.id, handler)
        lifecycleUnsubs.push(unsub)
        return unsub
      },
    },
    log(message, level = 'info') {
      pluginLog(manifest.id, message, level)
    },
  }

  const cleanup: PluginCleanup = () => {
    for (const blockId of registeredBlockIds) unregisterBlock(blockId)
    registeredBlockIds.clear()
    untrackPluginBlocksFor(manifest.id)
    for (const commandId of registeredCommandIds) unregisterPluginCommand(commandId)
    registeredCommandIds.clear()
    unregisterPluginExportFormatsFor(manifest.id)
    unregisterPluginImportFormatsFor(manifest.id)
    unregisterPluginSidebarPanelsFor(manifest.id)
    unregisterPluginSettingsPanelsFor(manifest.id)
    unregisterPluginExtensionsFor(manifest.id)
    unregisterPluginNlpSkillsFor(manifest.id)
    unregisterPluginMcpToolsFor(manifest.id)
    for (const unsub of lifecycleUnsubs) unsub()
    lifecycleUnsubs.length = 0
    unregisterPluginLifecycleHandlersFor(manifest.id)
  }

  return { api, cleanup }
}
