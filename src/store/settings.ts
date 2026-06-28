import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { StorageSettings } from '@/lib/db/api'
import { applyThemeSettings } from '@/lib/themes/apply'
import { getDefaultCustomTheme } from '@/lib/themes/presets'
import type { ThemeColors, ThemePresetId, ThemeSettings } from '@/lib/themes/types'
import { DEFAULT_PAGE_SETUP, type PageSetup } from '@/lib/editor/page-setup'

export type ThemeMode = ThemePresetId

const THEME_KEY_V2 = 'scribe-theme-v2'
const THEME_KEY_LEGACY = 'scribe-theme'

function readThemeSettings(): ThemeSettings {
  try {
    const raw = localStorage.getItem(THEME_KEY_V2)
    if (raw) {
      const parsed = JSON.parse(raw) as ThemeSettings
      if (parsed.themeId) {
        return {
          themeId: parsed.themeId,
          customTheme: parsed.customTheme,
        }
      }
    }
  } catch {
    // ignore
  }

  const legacy = localStorage.getItem(THEME_KEY_LEGACY)
  if (legacy === 'light' || legacy === 'dark' || legacy === 'system') {
    return { themeId: legacy }
  }

  return { themeId: 'system' }
}

export const themeSettingsAtom = atom<ThemeSettings>(readThemeSettings())

export const settingsOpenAtom = atom(false)

export const templatePickerOpenAtom = atom(false)

export const storageSettingsAtom = atom<StorageSettings | null>(null)

const EDITOR_VIEW_MODE_KEY = 'scribe-editor-view-mode'

export type EditorViewMode = 'rich' | 'markdown'

function readEditorViewMode(): EditorViewMode {
  return localStorage.getItem(EDITOR_VIEW_MODE_KEY) === 'markdown' ? 'markdown' : 'rich'
}

export const editorViewModeAtom = atom<EditorViewMode>(readEditorViewMode())

export const setEditorViewModeAtom = atom(null, (_get, set, mode: EditorViewMode) => {
  set(editorViewModeAtom, mode)
  localStorage.setItem(EDITOR_VIEW_MODE_KEY, mode)
})

export type EditorModeActions = {
  viewMode: EditorViewMode
  switchToMarkdown: () => void
  switchToRich: () => void
}

export const editorModeActionsAtom = atom<EditorModeActions | null>(null)

const PAGE_SETUP_KEY = 'scribe-page-setup'
const SPELL_CHECK_KEY = 'scribe-spell-check'
const PRINT_LAYOUT_KEY = 'scribe-print-layout'
const PRINT_ZOOM_KEY = 'scribe-print-zoom'
const PRINT_COLUMNS_KEY = 'scribe-print-columns'

export const pageSetupAtom = atomWithStorage<PageSetup>(PAGE_SETUP_KEY, DEFAULT_PAGE_SETUP)

export type PrintLayoutColumns = 1 | 2

function readPrintLayoutEnabled(): boolean {
  return localStorage.getItem(PRINT_LAYOUT_KEY) === 'true'
}

function readPrintZoom(): number {
  const raw = localStorage.getItem(PRINT_ZOOM_KEY)
  const value = raw ? Number(raw) : 0.85
  return Number.isFinite(value) ? Math.min(1, Math.max(0.5, value)) : 0.85
}

function readPrintColumns(): PrintLayoutColumns {
  return localStorage.getItem(PRINT_COLUMNS_KEY) === '2' ? 2 : 1
}

export const printLayoutEnabledAtom = atom<boolean>(readPrintLayoutEnabled())
export const printZoomAtom = atom<number>(readPrintZoom())
export const printLayoutColumnsAtom = atom<PrintLayoutColumns>(readPrintColumns())

export const setPrintLayoutEnabledAtom = atom(null, (_get, set, enabled: boolean) => {
  set(printLayoutEnabledAtom, enabled)
  localStorage.setItem(PRINT_LAYOUT_KEY, String(enabled))
})

export const setPrintZoomAtom = atom(null, (_get, set, zoom: number) => {
  const value = Math.min(1, Math.max(0.5, zoom))
  set(printZoomAtom, value)
  localStorage.setItem(PRINT_ZOOM_KEY, String(value))
})

export const setPrintLayoutColumnsAtom = atom(null, (_get, set, columns: PrintLayoutColumns) => {
  set(printLayoutColumnsAtom, columns)
  localStorage.setItem(PRINT_COLUMNS_KEY, String(columns))
})

function readSpellCheckEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SPELL_CHECK_KEY)
    if (raw === 'false') return false
    if (raw === 'true') return true
  } catch {
    // ignore
  }
  return true
}

export const spellCheckEnabledAtom = atom<boolean>(readSpellCheckEnabled())

export const setSpellCheckEnabledAtom = atom(null, (_get, set, enabled: boolean) => {
  set(spellCheckEnabledAtom, enabled)
  localStorage.setItem(SPELL_CHECK_KEY, String(enabled))
})

export const applyThemeSettingsAtom = atom(
  null,
  (_get, set, settings: ThemeSettings) => {
    set(themeSettingsAtom, settings)
    localStorage.setItem(THEME_KEY_V2, JSON.stringify(settings))
    localStorage.setItem(THEME_KEY_LEGACY, settings.themeId)
    applyThemeSettings(settings)
  },
)

/** @deprecated use themeSettingsAtom */
export const themeAtom = atom(
  (get) => get(themeSettingsAtom).themeId,
  (_get, set, themeId: ThemePresetId) => {
    set(applyThemeSettingsAtom, { themeId })
  },
)

export function bootstrapTheme() {
  applyThemeSettings(readThemeSettings())
}

export function createThemeSelection(
  current: ThemeSettings,
  themeId: ThemePresetId,
): ThemeSettings {
  return { ...current, themeId }
}

export function createCustomThemeSelection(
  current: ThemeSettings,
  customTheme: ThemeColors,
): ThemeSettings {
  return {
    ...current,
    themeId: 'custom',
    customTheme,
  }
}

export function createResetCustomTheme(current: ThemeSettings): ThemeSettings {
  return {
    ...current,
    themeId: 'custom',
    customTheme: getDefaultCustomTheme(),
  }
}

/** @deprecated */
export function persistTheme(mode: ThemePresetId) {
  localStorage.setItem(THEME_KEY_LEGACY, mode)
}

/** @deprecated */
export function applyTheme(mode: ThemePresetId) {
  applyThemeSettings({ themeId: mode })
}

export function persistThemeSettings(settings: ThemeSettings) {
  localStorage.setItem(THEME_KEY_V2, JSON.stringify(settings))
  localStorage.setItem(THEME_KEY_LEGACY, settings.themeId)
}

export function setThemeSettings(
  set: (update: ThemeSettings) => void,
  settings: ThemeSettings,
) {
  set(settings)
  persistThemeSettings(settings)
  applyThemeSettings(settings)
}
