import type { AppLocale } from '@/i18n'
import type { PageSetup } from '@/lib/editor/page-setup'
import { DEFAULT_PAGE_SETUP } from '@/lib/editor/page-setup'
import type { ThemeSettings } from '@/lib/themes/types'
import type { CustomDocumentTemplate } from '@/lib/templates/custom'
import { parseStoredCustomTemplates } from '@/lib/templates/custom'
import type { CustomTemplateCategory } from '@/lib/templates/categories'
import { parseStoredCustomCategories } from '@/lib/templates/categories'

const THEME_KEY_V2 = 'scribe-theme-v2'
const THEME_KEY_LEGACY = 'scribe-theme'
const EDITOR_VIEW_MODE_KEY = 'scribe-editor-view-mode'
const PAGE_SETUP_KEY = 'scribe-page-setup'
const SPELL_CHECK_KEY = 'scribe-spell-check'
const PRINT_LAYOUT_KEY = 'scribe-print-layout'
const PRINT_ZOOM_KEY = 'scribe-print-zoom'
const PRINT_COLUMNS_KEY = 'scribe-print-columns'
const MANUAL_TITLES_KEY = 'scribe-manual-titles'
const COMMENT_AUTHOR_KEY = 'scribe-comment-author'
const CUSTOM_TEMPLATES_KEY = 'scribe-custom-templates'
const CUSTOM_TEMPLATE_CATEGORIES_KEY = 'scribe-custom-template-categories'
const STORAGE_ACCESS_EXPLAINER_KEY = 'scribe-storage-access-explainer-dismissed'
const STORAGE_FOLDER_ACCESS_GRANTED_KEY = 'scribe-storage-folder-access-granted'
const LOCALE_KEY = 'scribe-locale'
const ACTIVE_DOCUMENT_ID_KEY = 'scribe-active-document-id'
const ONBOARDING_DISMISSED_KEY = 'scribe-onboarding-dismissed'
const SCRATCH_DOCUMENT_ID_KEY = 'scribe-scratch-document-id'
const SHORTCUT_OVERRIDES_KEY = 'scribe-shortcut-overrides'

export function readLocale(): AppLocale {
  try {
    const raw = localStorage.getItem(LOCALE_KEY)
    if (raw === 'en' || raw === 'sk') return raw
  } catch {
    // ignore
  }
  return 'sk'
}

export function persistLocale(locale: AppLocale) {
  localStorage.setItem(LOCALE_KEY, locale)
}

export function readActiveDocumentId(): string | null {
  try {
    const raw = localStorage.getItem(ACTIVE_DOCUMENT_ID_KEY)
    return raw && raw.trim() ? raw : null
  } catch {
    return null
  }
}

export function persistActiveDocumentId(id: string | null) {
  if (id) {
    localStorage.setItem(ACTIVE_DOCUMENT_ID_KEY, id)
    return
  }
  localStorage.removeItem(ACTIVE_DOCUMENT_ID_KEY)
}

export function readOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function persistOnboardingDismissed(dismissed: boolean) {
  if (dismissed) {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1')
    return
  }
  localStorage.removeItem(ONBOARDING_DISMISSED_KEY)
}

export function readScratchDocumentId(): string | null {
  try {
    const raw = localStorage.getItem(SCRATCH_DOCUMENT_ID_KEY)
    return raw && raw.trim() ? raw : null
  } catch {
    return null
  }
}

export function persistScratchDocumentId(id: string | null) {
  if (id) {
    localStorage.setItem(SCRATCH_DOCUMENT_ID_KEY, id)
    return
  }
  localStorage.removeItem(SCRATCH_DOCUMENT_ID_KEY)
}

export type ShortcutOverrides = Record<string, string>

export function readShortcutOverrides(): ShortcutOverrides {
  try {
    const raw = localStorage.getItem(SHORTCUT_OVERRIDES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ShortcutOverrides
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function persistShortcutOverrides(overrides: ShortcutOverrides) {
  localStorage.setItem(SHORTCUT_OVERRIDES_KEY, JSON.stringify(overrides))
}

export function readStorageAccessExplainerDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_ACCESS_EXPLAINER_KEY) === '1'
  } catch {
    return false
  }
}

export function persistStorageAccessExplainerDismissed(dismissed: boolean) {
  if (dismissed) {
    localStorage.setItem(STORAGE_ACCESS_EXPLAINER_KEY, '1')
    return
  }
  localStorage.removeItem(STORAGE_ACCESS_EXPLAINER_KEY)
}

export function readStorageFolderAccessGranted(): boolean {
  try {
    return localStorage.getItem(STORAGE_FOLDER_ACCESS_GRANTED_KEY) === '1'
  } catch {
    return false
  }
}

export function persistStorageFolderAccessGranted(granted: boolean) {
  if (granted) {
    localStorage.setItem(STORAGE_FOLDER_ACCESS_GRANTED_KEY, '1')
    persistStorageAccessExplainerDismissed(true)
    return
  }
  localStorage.removeItem(STORAGE_FOLDER_ACCESS_GRANTED_KEY)
}

export function hasStorageFolderAccess(): boolean {
  return readStorageFolderAccessGranted()
}

export function readThemeSettings(): ThemeSettings {
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

export function persistThemeSettings(settings: ThemeSettings) {
  localStorage.setItem(THEME_KEY_V2, JSON.stringify(settings))
  localStorage.setItem(THEME_KEY_LEGACY, settings.themeId)
}

export function readEditorViewMode(): 'rich' | 'markdown' {
  return localStorage.getItem(EDITOR_VIEW_MODE_KEY) === 'markdown' ? 'markdown' : 'rich'
}

export function persistEditorViewMode(mode: 'rich' | 'markdown') {
  localStorage.setItem(EDITOR_VIEW_MODE_KEY, mode)
}

export function readPageSetup(): PageSetup {
  try {
    const raw = localStorage.getItem(PAGE_SETUP_KEY)
    if (raw) return JSON.parse(raw) as PageSetup
  } catch {
    // ignore
  }
  return DEFAULT_PAGE_SETUP
}

export function persistPageSetup(pageSetup: PageSetup) {
  localStorage.setItem(PAGE_SETUP_KEY, JSON.stringify(pageSetup))
}

export function readSpellCheckEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SPELL_CHECK_KEY)
    if (raw === 'false') return false
    if (raw === 'true') return true
  } catch {
    // ignore
  }
  return true
}

export function persistSpellCheckEnabled(enabled: boolean) {
  localStorage.setItem(SPELL_CHECK_KEY, String(enabled))
}

export function readPrintLayoutEnabled(): boolean {
  return localStorage.getItem(PRINT_LAYOUT_KEY) === 'true'
}

export function persistPrintLayoutEnabled(enabled: boolean) {
  localStorage.setItem(PRINT_LAYOUT_KEY, String(enabled))
}

export function readPrintZoom(): number {
  const raw = localStorage.getItem(PRINT_ZOOM_KEY)
  const value = raw ? Number(raw) : 0.85
  return Number.isFinite(value) ? Math.min(1, Math.max(0.5, value)) : 0.85
}

export function persistPrintZoom(zoom: number) {
  localStorage.setItem(PRINT_ZOOM_KEY, String(zoom))
}

export function readPrintColumns(): 1 | 2 {
  return localStorage.getItem(PRINT_COLUMNS_KEY) === '2' ? 2 : 1
}

export function persistPrintColumns(columns: 1 | 2) {
  localStorage.setItem(PRINT_COLUMNS_KEY, String(columns))
}

export function readManualTitleIds(): string[] {
  try {
    const raw = localStorage.getItem(MANUAL_TITLES_KEY)
    if (raw) return JSON.parse(raw) as string[]
  } catch {
    // ignore
  }
  return []
}

export function persistManualTitleIds(ids: string[]) {
  localStorage.setItem(MANUAL_TITLES_KEY, JSON.stringify(ids))
}

export function readCommentAuthor(): string {
  try {
    const raw = localStorage.getItem(COMMENT_AUTHOR_KEY)
    if (raw && raw.trim()) return raw
  } catch {
    // ignore
  }
  return 'Ja'
}

export function persistCommentAuthor(name: string) {
  localStorage.setItem(COMMENT_AUTHOR_KEY, name)
}

export function readBoolStorage(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === 'true') return true
    if (raw === 'false') return false
  } catch {
    // ignore
  }
  return fallback
}

export function persistBoolStorage(key: string, value: boolean) {
  localStorage.setItem(key, String(value))
}

export function readCustomTemplates(): CustomDocumentTemplate[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TEMPLATES_KEY)
    if (!raw) return []
    return parseStoredCustomTemplates(JSON.parse(raw))
  } catch {
    return []
  }
}

export function persistCustomTemplates(templates: CustomDocumentTemplate[]) {
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates))
}

export function readCustomTemplateCategories(): CustomTemplateCategory[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TEMPLATE_CATEGORIES_KEY)
    if (!raw) return []
    return parseStoredCustomCategories(JSON.parse(raw))
  } catch {
    return []
  }
}

export function persistCustomTemplateCategories(categories: CustomTemplateCategory[]) {
  localStorage.setItem(CUSTOM_TEMPLATE_CATEGORIES_KEY, JSON.stringify(categories))
}
