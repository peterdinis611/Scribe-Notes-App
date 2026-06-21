import { atom } from 'jotai'
import type { StorageSettings } from '@/lib/db/api'
import { applyThemeSettings } from '@/lib/themes/apply'
import { getDefaultCustomTheme } from '@/lib/themes/presets'
import type { ThemeColors, ThemePresetId, ThemeSettings } from '@/lib/themes/types'

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
