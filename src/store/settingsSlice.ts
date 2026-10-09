import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { StorageSettings } from '@/lib/db/api'
import type { AppLocale } from '@/i18n'
import type { PageSetup } from '@/lib/editor/page-setup'
import { applyThemeSettings } from '@/lib/themes/apply'
import type { ThemeSettings } from '@/lib/themes/types'
import type { UiSkin } from '@/lib/ui-skin'
import type {
  AgentPrefs,
  AgentRoleId,
  AgentTeaching,
  AgentTeachingScope,
  AgentTeachingTopic,
} from '@/lib/library/agent-prefs'
import {
  AGENT_PINNED_FACTS_MAX,
  AGENT_TEACHINGS_GLOBAL_MAX,
  createPinnedFact,
  createTeaching,
  normalizeAgentPrefs,
} from '@/lib/library/agent-prefs'
import {
  persistEditorViewMode,
  persistFolderAutoSyncEnabled,
  persistPageSetup,
  persistPrintColumns,
  persistPrintLayoutEnabled,
  persistPrintZoom,
  persistSpellCheckEnabled,
  persistThemeSettings,
  persistLocale,
  persistUiSkin,
  persistAutoBackupEnabled,
  persistAutoBackupIntervalHours,
  persistAutoBackupDirectory,
  persistLastAutoBackupAt,
  persistAgentPrefs,
  persistStorageModeEnabled,
  readEditorViewMode,
  readFolderAutoSyncEnabled,
  readLocale,
  readPageSetup,
  readPrintColumns,
  readPrintLayoutEnabled,
  readPrintZoom,
  readSpellCheckEnabled,
  readShortcutOverrides,
  readThemeSettings,
  readUiSkin,
  readAutoBackupEnabled,
  readAutoBackupIntervalHours,
  readAutoBackupDirectory,
  readLastAutoBackupAt,
  readAgentPrefs,
  readStorageModeEnabled,
  readShowDocumentTabs,
  readShowEditorToolbar,
  readShowStatusBar,
  readShowPanelRail,
  readUiZoom,
  persistShowDocumentTabs,
  persistShowEditorToolbar,
  persistShowStatusBar,
  persistShowPanelRail,
  persistUiZoom,
  applyUiZoom,
  clampUiZoom,
  persistShortcutOverrides,
  type AutoBackupIntervalHours,
  type ShortcutOverrides,
} from '@/store/persistence'
import {
  clearAgentTeachingsOnBackend,
  forgetAgentTeachingBackend,
  saveAgentPrefsToBackend,
  teachAgentBackend,
} from '@/lib/library/agent-backend'

export type EditorViewMode = 'rich' | 'markdown'
export type PrintLayoutColumns = 1 | 2

export type EditorModeActions = {
  viewMode: EditorViewMode
  switchToMarkdown: () => void
  switchToRich: () => void
}

export interface SettingsState {
  themeSettings: ThemeSettings
  uiSkin: UiSkin
  templatePickerOpen: boolean
  storageSettings: StorageSettings | null
  locale: AppLocale
  editorViewMode: EditorViewMode
  pageSetup: PageSetup
  printLayoutEnabled: boolean
  printZoom: number
  printLayoutColumns: PrintLayoutColumns
  spellCheckEnabled: boolean
  folderAutoSyncEnabled: boolean
  storageModeEnabled: boolean
  autoBackupEnabled: boolean
  autoBackupIntervalHours: AutoBackupIntervalHours
  autoBackupDirectory: string | null
  lastAutoBackupAt: number | null
  shortcutOverrides: ShortcutOverrides
  agentPrefs: AgentPrefs
  showDocumentTabs: boolean
  showEditorToolbar: boolean
  showStatusBar: boolean
  showPanelRail: boolean
  uiZoom: number
}

const initialState: SettingsState = {
  themeSettings: readThemeSettings(),
  uiSkin: readUiSkin(),
  templatePickerOpen: false,
  storageSettings: null,
  locale: readLocale(),
  editorViewMode: readEditorViewMode(),
  pageSetup: readPageSetup(),
  printLayoutEnabled: readPrintLayoutEnabled(),
  printZoom: readPrintZoom(),
  printLayoutColumns: readPrintColumns(),
  spellCheckEnabled: readSpellCheckEnabled(),
  folderAutoSyncEnabled: readFolderAutoSyncEnabled(),
  storageModeEnabled: readStorageModeEnabled(),
  autoBackupEnabled: readAutoBackupEnabled(),
  autoBackupIntervalHours: readAutoBackupIntervalHours(),
  autoBackupDirectory: readAutoBackupDirectory(),
  lastAutoBackupAt: readLastAutoBackupAt(),
  shortcutOverrides: readShortcutOverrides(),
  agentPrefs: readAgentPrefs(),
  showDocumentTabs: readShowDocumentTabs(),
  showEditorToolbar: readShowEditorToolbar(),
  showStatusBar: readShowStatusBar(),
  showPanelRail: readShowPanelRail(),
  uiZoom: readUiZoom(),
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setThemeSettings(state, action: PayloadAction<ThemeSettings>) {
      state.themeSettings = action.payload
      persistThemeSettings(action.payload)
      applyThemeSettings(action.payload, state.uiSkin)
    },
    setUiSkin(state, action: PayloadAction<UiSkin>) {
      state.uiSkin = action.payload
      persistUiSkin(action.payload)
      applyThemeSettings(state.themeSettings, action.payload)
    },
    setTemplatePickerOpen(state, action: PayloadAction<boolean>) {
      state.templatePickerOpen = action.payload
    },
    setStorageSettings(state, action: PayloadAction<StorageSettings | null>) {
      state.storageSettings = action.payload
    },
    setLocale(state, action: PayloadAction<AppLocale>) {
      state.locale = action.payload
      persistLocale(action.payload)
    },
    setEditorViewMode(state, action: PayloadAction<EditorViewMode>) {
      state.editorViewMode = action.payload
      persistEditorViewMode(action.payload)
    },
    setPageSetup(state, action: PayloadAction<PageSetup>) {
      state.pageSetup = action.payload
      persistPageSetup(action.payload)
    },
    setPrintLayoutEnabled(state, action: PayloadAction<boolean>) {
      state.printLayoutEnabled = action.payload
      persistPrintLayoutEnabled(action.payload)
    },
    setPrintZoom(state, action: PayloadAction<number>) {
      const value = Math.min(1, Math.max(0.5, action.payload))
      state.printZoom = value
      persistPrintZoom(value)
    },
    setPrintLayoutColumns(state, action: PayloadAction<PrintLayoutColumns>) {
      state.printLayoutColumns = action.payload
      persistPrintColumns(action.payload)
    },
    setSpellCheckEnabled(state, action: PayloadAction<boolean>) {
      state.spellCheckEnabled = action.payload
      persistSpellCheckEnabled(action.payload)
    },
    setFolderAutoSyncEnabled(state, action: PayloadAction<boolean>) {
      state.folderAutoSyncEnabled = action.payload
      persistFolderAutoSyncEnabled(action.payload)
    },
    setStorageModeEnabled(state, action: PayloadAction<boolean>) {
      state.storageModeEnabled = action.payload
      persistStorageModeEnabled(action.payload)
    },
    setAutoBackupEnabled(state, action: PayloadAction<boolean>) {
      state.autoBackupEnabled = action.payload
      persistAutoBackupEnabled(action.payload)
    },
    setAutoBackupIntervalHours(state, action: PayloadAction<AutoBackupIntervalHours>) {
      const hours = action.payload
      state.autoBackupIntervalHours = hours
      persistAutoBackupIntervalHours(hours)
    },
    setAutoBackupDirectory(state, action: PayloadAction<string | null>) {
      state.autoBackupDirectory = action.payload
      persistAutoBackupDirectory(action.payload)
    },
    setLastAutoBackupAt(state, action: PayloadAction<number | null>) {
      state.lastAutoBackupAt = action.payload
      persistLastAutoBackupAt(action.payload)
    },
    setShortcutOverride(state, action: PayloadAction<{ id: string; hotkey: string | null }>) {
      const next = { ...state.shortcutOverrides }
      if (action.payload.hotkey) {
        next[action.payload.id] = action.payload.hotkey
      } else {
        delete next[action.payload.id]
      }
      state.shortcutOverrides = next
      persistShortcutOverrides(next)
    },
    resetShortcutOverrides(state) {
      state.shortcutOverrides = {}
      persistShortcutOverrides({})
    },
    setAgentPrefs(state, action: PayloadAction<AgentPrefs>) {
      const next = normalizeAgentPrefs(action.payload)
      state.agentPrefs = next
      persistAgentPrefs(next)
      void saveAgentPrefsToBackend(next)
    },
    patchAgentPrefs(state, action: PayloadAction<Partial<AgentPrefs>>) {
      const next = normalizeAgentPrefs({ ...state.agentPrefs, ...action.payload })
      state.agentPrefs = next
      persistAgentPrefs(next)
      void saveAgentPrefsToBackend(next)
    },
    addAgentTeaching(
      state,
      action: PayloadAction<
        | string
        | {
            text: string
            scope?: AgentTeachingScope
            documentId?: string | null
            topic?: AgentTeachingTopic
            agentId?: AgentRoleId
          }
      >,
    ) {
      const payload = action.payload
      const text = typeof payload === 'string' ? payload : payload.text
      const opts =
        typeof payload === 'string'
          ? undefined
          : {
              scope: payload.scope,
              documentId: payload.documentId,
              topic: payload.topic,
              agentId: payload.agentId,
            }
      const teaching = createTeaching(text, opts)
      if (!teaching) return
      const teachings = [teaching, ...state.agentPrefs.teachings]
        .filter(
          (item, index, list) =>
            list.findIndex(
              (other) =>
                other.text.toLowerCase() === item.text.toLowerCase() &&
                (other.agentId ?? 'general') === (item.agentId ?? 'general'),
            ) === index,
        )
        .slice(0, AGENT_TEACHINGS_GLOBAL_MAX)
      const next = normalizeAgentPrefs({ ...state.agentPrefs, teachings })
      state.agentPrefs = next
      persistAgentPrefs(next)
      void teachAgentBackend(
        teaching.text,
        teaching.topic === 'grammar' ? 'grammar' : 'general',
        teaching.agentId,
      )
    },
    removeAgentTeaching(state, action: PayloadAction<string>) {
      const teachings = state.agentPrefs.teachings.filter((item) => item.id !== action.payload)
      const next = normalizeAgentPrefs({ ...state.agentPrefs, teachings })
      state.agentPrefs = next
      persistAgentPrefs(next)
      void forgetAgentTeachingBackend(action.payload)
    },
    clearAgentTeachings(state) {
      const next = normalizeAgentPrefs({ ...state.agentPrefs, teachings: [] as AgentTeaching[] })
      state.agentPrefs = next
      persistAgentPrefs(next)
      void clearAgentTeachingsOnBackend()
    },
    addAgentPinnedFact(state, action: PayloadAction<string>) {
      const fact = createPinnedFact(action.payload)
      if (!fact) return
      const pinnedFacts = [fact, ...state.agentPrefs.pinnedFacts]
        .filter(
          (item, index, list) =>
            list.findIndex((other) => other.text.toLowerCase() === item.text.toLowerCase()) ===
            index,
        )
        .slice(0, AGENT_PINNED_FACTS_MAX)
      const next = normalizeAgentPrefs({ ...state.agentPrefs, pinnedFacts })
      state.agentPrefs = next
      persistAgentPrefs(next)
    },
    removeAgentPinnedFact(state, action: PayloadAction<string>) {
      const pinnedFacts = state.agentPrefs.pinnedFacts.filter((item) => item.id !== action.payload)
      const next = normalizeAgentPrefs({ ...state.agentPrefs, pinnedFacts })
      state.agentPrefs = next
      persistAgentPrefs(next)
    },
    hydrateAgentPrefs(state, action: PayloadAction<AgentPrefs>) {
      const next = normalizeAgentPrefs(action.payload)
      state.agentPrefs = next
      persistAgentPrefs(next)
    },
    setShowDocumentTabs(state, action: PayloadAction<boolean>) {
      state.showDocumentTabs = action.payload
      persistShowDocumentTabs(action.payload)
    },
    setShowEditorToolbar(state, action: PayloadAction<boolean>) {
      state.showEditorToolbar = action.payload
      persistShowEditorToolbar(action.payload)
    },
    setShowStatusBar(state, action: PayloadAction<boolean>) {
      state.showStatusBar = action.payload
      persistShowStatusBar(action.payload)
    },
    setShowPanelRail(state, action: PayloadAction<boolean>) {
      state.showPanelRail = action.payload
      persistShowPanelRail(action.payload)
    },
    setUiZoom(state, action: PayloadAction<number>) {
      const value = clampUiZoom(action.payload)
      state.uiZoom = value
      persistUiZoom(value)
      applyUiZoom(value)
    },
  },
})

export const {
  setThemeSettings,
  setUiSkin,
  setTemplatePickerOpen,
  setStorageSettings,
  setLocale,
  setEditorViewMode,
  setPageSetup,
  setPrintLayoutEnabled,
  setPrintZoom,
  setPrintLayoutColumns,
  setSpellCheckEnabled,
  setFolderAutoSyncEnabled,
  setStorageModeEnabled,
  setAutoBackupEnabled,
  setAutoBackupIntervalHours,
  setAutoBackupDirectory,
  setLastAutoBackupAt,
  setShortcutOverride,
  resetShortcutOverrides,
  setAgentPrefs,
  patchAgentPrefs,
  addAgentTeaching,
  removeAgentTeaching,
  clearAgentTeachings,
  addAgentPinnedFact,
  removeAgentPinnedFact,
  hydrateAgentPrefs,
  setShowDocumentTabs,
  setShowEditorToolbar,
  setShowStatusBar,
  setShowPanelRail,
  setUiZoom,
} = settingsSlice.actions

export default settingsSlice.reducer

export function bootstrapTheme() {
  applyThemeSettings(readThemeSettings(), readUiSkin())
  applyUiZoom(readUiZoom())
}
