import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { StorageSettings } from '@/lib/db/api'
import type { AppLocale } from '@/i18n'
import type { PageSetup } from '@/lib/editor/page-setup'
import { applyThemeSettings } from '@/lib/themes/apply'
import type { ThemeSettings } from '@/lib/themes/types'
import {
  persistEditorViewMode,
  persistPageSetup,
  persistPrintColumns,
  persistPrintLayoutEnabled,
  persistPrintZoom,
  persistSpellCheckEnabled,
  persistThemeSettings,
  persistLocale,
  readEditorViewMode,
  readLocale,
  readPageSetup,
  readPrintColumns,
  readPrintLayoutEnabled,
  readPrintZoom,
  readSpellCheckEnabled,
  readThemeSettings,
} from '@/store/persistence'

export type EditorViewMode = 'rich' | 'markdown'
export type PrintLayoutColumns = 1 | 2

export type EditorModeActions = {
  viewMode: EditorViewMode
  switchToMarkdown: () => void
  switchToRich: () => void
}

export interface SettingsState {
  themeSettings: ThemeSettings
  templatePickerOpen: boolean
  storageSettings: StorageSettings | null
  locale: AppLocale
  editorViewMode: EditorViewMode
  pageSetup: PageSetup
  printLayoutEnabled: boolean
  printZoom: number
  printLayoutColumns: PrintLayoutColumns
  spellCheckEnabled: boolean
}

const initialState: SettingsState = {
  themeSettings: readThemeSettings(),
  templatePickerOpen: false,
  storageSettings: null,
  locale: readLocale(),
  editorViewMode: readEditorViewMode(),
  pageSetup: readPageSetup(),
  printLayoutEnabled: readPrintLayoutEnabled(),
  printZoom: readPrintZoom(),
  printLayoutColumns: readPrintColumns(),
  spellCheckEnabled: readSpellCheckEnabled(),
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setThemeSettings(state, action: PayloadAction<ThemeSettings>) {
      state.themeSettings = action.payload
      persistThemeSettings(action.payload)
      applyThemeSettings(action.payload)
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
  },
})

export const {
  setThemeSettings,
  setTemplatePickerOpen,
  setStorageSettings,
  setLocale,
  setEditorViewMode,
  setPageSetup,
  setPrintLayoutEnabled,
  setPrintZoom,
  setPrintLayoutColumns,
  setSpellCheckEnabled,
} = settingsSlice.actions

export default settingsSlice.reducer

export function bootstrapTheme() {
  applyThemeSettings(readThemeSettings())
}
