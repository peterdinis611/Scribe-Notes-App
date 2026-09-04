import type { AppLocale } from '@/i18n'
import type { PageSetup } from '@/lib/editor/page-setup'
import { DEFAULT_PAGE_SETUP, normalizePageSetup } from '@/lib/editor/page-setup'
import { kvGet, kvRemove, kvSet } from '@/lib/storage/kv'
import type { ThemeSettings } from '@/lib/themes/types'
import type { CustomDocumentTemplate } from '@/lib/templates/custom'
import { parseStoredCustomTemplates } from '@/lib/templates/custom'
import type { CustomTemplateCategory } from '@/lib/templates/categories'
import { parseStoredCustomCategories } from '@/lib/templates/categories'
import { LOCALE_KEY, UI_SKIN_KEY, ACTIVE_DOCUMENT_ID_KEY, ONBOARDING_DISMISSED_KEY, WHATS_NEW_VERSION_KEY, DOCUMENT_TOC_LEFT_KEY, SCRATCH_DOCUMENT_ID_KEY, SHORTCUT_OVERRIDES_KEY, STORAGE_ACCESS_EXPLAINER_KEY, STORAGE_FOLDER_ACCESS_GRANTED_KEY, FOLDER_AUTO_SYNC_KEY, THEME_KEY_V2, THEME_KEY_LEGACY, EDITOR_VIEW_MODE_KEY, PAGE_SETUP_KEY, SPELL_CHECK_KEY, PRINT_LAYOUT_KEY, PRINT_ZOOM_KEY, PRINT_COLUMNS_KEY, MANUAL_TITLES_KEY, COMMENT_AUTHOR_KEY, CUSTOM_TEMPLATES_KEY, CUSTOM_TEMPLATE_CATEGORIES_KEY } from './keys'

export function readLocale(): AppLocale {
  try {
    const raw = kvGet(LOCALE_KEY)
    if (raw === 'en' || raw === 'sk') return raw
  } catch {
    // ignore
  }
  return 'sk'
}

export function persistLocale(locale: AppLocale) {
  kvSet(LOCALE_KEY, locale)
}

export function readUiSkin(): import('@/lib/ui-skin').UiSkin {
  try {
    const raw = kvGet(UI_SKIN_KEY)
    if (raw === 'classic' || raw === 'press') return raw
  } catch {
    // ignore
  }
  return 'classic'
}

export function persistUiSkin(skin: import('@/lib/ui-skin').UiSkin) {
  kvSet(UI_SKIN_KEY, skin)
}

export function readActiveDocumentId(): string | null {
  try {
    const raw = kvGet(ACTIVE_DOCUMENT_ID_KEY)
    return raw && raw.trim() ? raw : null
  } catch {
    return null
  }
}

export function persistActiveDocumentId(id: string | null) {
  if (id) {
    kvSet(ACTIVE_DOCUMENT_ID_KEY, id)
    return
  }
  kvRemove(ACTIVE_DOCUMENT_ID_KEY)
}

export function readOnboardingDismissed(): boolean {
  try {
    return kvGet(ONBOARDING_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function persistOnboardingDismissed(dismissed: boolean) {
  if (dismissed) {
    kvSet(ONBOARDING_DISMISSED_KEY, '1')
    return
  }
  kvRemove(ONBOARDING_DISMISSED_KEY)
}

export function readWhatsNewVersion(): string | null {
  try {
    const raw = kvGet(WHATS_NEW_VERSION_KEY)
    return raw && raw.trim() ? raw : null
  } catch {
    return null
  }
}

export function persistWhatsNewVersion(version: string) {
  kvSet(WHATS_NEW_VERSION_KEY, version)
}

export function readDocumentTocLeftOpen(): boolean {
  return readBoolStorage(DOCUMENT_TOC_LEFT_KEY, false)
}

export function persistDocumentTocLeftOpen(open: boolean) {
  persistBoolStorage(DOCUMENT_TOC_LEFT_KEY, open)
}

export function readScratchDocumentId(): string | null {
  try {
    const raw = kvGet(SCRATCH_DOCUMENT_ID_KEY)
    return raw && raw.trim() ? raw : null
  } catch {
    return null
  }
}

export function persistScratchDocumentId(id: string | null) {
  if (id) {
    kvSet(SCRATCH_DOCUMENT_ID_KEY, id)
    return
  }
  kvRemove(SCRATCH_DOCUMENT_ID_KEY)
}

export type ShortcutOverrides = Record<string, string>

export function readShortcutOverrides(): ShortcutOverrides {
  try {
    const raw = kvGet(SHORTCUT_OVERRIDES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ShortcutOverrides
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function persistShortcutOverrides(overrides: ShortcutOverrides) {
  kvSet(SHORTCUT_OVERRIDES_KEY, JSON.stringify(overrides))
}

export function readStorageAccessExplainerDismissed(): boolean {
  try {
    return kvGet(STORAGE_ACCESS_EXPLAINER_KEY) === '1'
  } catch {
    return false
  }
}

export function persistStorageAccessExplainerDismissed(dismissed: boolean) {
  if (dismissed) {
    kvSet(STORAGE_ACCESS_EXPLAINER_KEY, '1')
    return
  }
  kvRemove(STORAGE_ACCESS_EXPLAINER_KEY)
}

export function readStorageFolderAccessGranted(): boolean {
  try {
    return kvGet(STORAGE_FOLDER_ACCESS_GRANTED_KEY) === '1'
  } catch {
    return false
  }
}

export function persistStorageFolderAccessGranted(granted: boolean) {
  if (granted) {
    kvSet(STORAGE_FOLDER_ACCESS_GRANTED_KEY, '1')
    persistStorageAccessExplainerDismissed(true)
    return
  }
  kvRemove(STORAGE_FOLDER_ACCESS_GRANTED_KEY)
}

export function readFolderAutoSyncEnabled(): boolean {
  return readBoolStorage(FOLDER_AUTO_SYNC_KEY, true)
}

export function persistFolderAutoSyncEnabled(enabled: boolean) {
  persistBoolStorage(FOLDER_AUTO_SYNC_KEY, enabled)
}

export function hasStorageFolderAccess(): boolean {
  return readStorageFolderAccessGranted()
}

export function readThemeSettings(): ThemeSettings {
  try {
    const raw = kvGet(THEME_KEY_V2)
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

  const legacy = kvGet(THEME_KEY_LEGACY)
  if (legacy === 'light' || legacy === 'dark' || legacy === 'system') {
    return { themeId: legacy }
  }

  return { themeId: 'system' }
}

export function persistThemeSettings(settings: ThemeSettings) {
  kvSet(THEME_KEY_V2, JSON.stringify(settings))
  kvSet(THEME_KEY_LEGACY, settings.themeId)
}

export function readEditorViewMode(): 'rich' | 'markdown' {
  return kvGet(EDITOR_VIEW_MODE_KEY) === 'markdown' ? 'markdown' : 'rich'
}

export function persistEditorViewMode(mode: 'rich' | 'markdown') {
  kvSet(EDITOR_VIEW_MODE_KEY, mode)
}

export function readPageSetup(): PageSetup {
  try {
    const raw = kvGet(PAGE_SETUP_KEY)
    if (raw) return normalizePageSetup(JSON.parse(raw) as PageSetup)
  } catch {
    // ignore
  }
  return DEFAULT_PAGE_SETUP
}

export function persistPageSetup(pageSetup: PageSetup) {
  kvSet(PAGE_SETUP_KEY, JSON.stringify(pageSetup))
}

export function readSpellCheckEnabled(): boolean {
  try {
    const raw = kvGet(SPELL_CHECK_KEY)
    if (raw === 'false') return false
    if (raw === 'true') return true
  } catch {
    // ignore
  }
  return true
}

export function persistSpellCheckEnabled(enabled: boolean) {
  kvSet(SPELL_CHECK_KEY, String(enabled))
}

export function readPrintLayoutEnabled(): boolean {
  return kvGet(PRINT_LAYOUT_KEY) === 'true'
}

export function persistPrintLayoutEnabled(enabled: boolean) {
  kvSet(PRINT_LAYOUT_KEY, String(enabled))
}

export function readPrintZoom(): number {
  const raw = kvGet(PRINT_ZOOM_KEY)
  const value = raw ? Number(raw) : 0.85
  return Number.isFinite(value) ? Math.min(1, Math.max(0.5, value)) : 0.85
}

export function persistPrintZoom(zoom: number) {
  kvSet(PRINT_ZOOM_KEY, String(zoom))
}

export function readPrintColumns(): 1 | 2 {
  return kvGet(PRINT_COLUMNS_KEY) === '2' ? 2 : 1
}

export function persistPrintColumns(columns: 1 | 2) {
  kvSet(PRINT_COLUMNS_KEY, String(columns))
}

export function readManualTitleIds(): string[] {
  try {
    const raw = kvGet(MANUAL_TITLES_KEY)
    if (raw) return JSON.parse(raw) as string[]
  } catch {
    // ignore
  }
  return []
}

export function persistManualTitleIds(ids: string[]) {
  kvSet(MANUAL_TITLES_KEY, JSON.stringify(ids))
}

export function readCommentAuthor(): string {
  try {
    const raw = kvGet(COMMENT_AUTHOR_KEY)
    if (raw && raw.trim()) return raw
  } catch {
    // ignore
  }
  return 'Ja'
}

export function persistCommentAuthor(name: string) {
  kvSet(COMMENT_AUTHOR_KEY, name)
}

export function readBoolStorage(key: string, fallback: boolean): boolean {
  try {
    const raw = kvGet(key)
    if (raw === 'true') return true
    if (raw === 'false') return false
  } catch {
    // ignore
  }
  return fallback
}

export function persistBoolStorage(key: string, value: boolean) {
  kvSet(key, String(value))
}

export function readCustomTemplates(): CustomDocumentTemplate[] {
  try {
    const raw = kvGet(CUSTOM_TEMPLATES_KEY)
    if (!raw) return []
    return parseStoredCustomTemplates(JSON.parse(raw))
  } catch {
    return []
  }
}

export function persistCustomTemplates(templates: CustomDocumentTemplate[]) {
  kvSet(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates))
}

export function readCustomTemplateCategories(): CustomTemplateCategory[] {
  try {
    const raw = kvGet(CUSTOM_TEMPLATE_CATEGORIES_KEY)
    if (!raw) return []
    return parseStoredCustomCategories(JSON.parse(raw))
  } catch {
    return []
  }
}

export function persistCustomTemplateCategories(categories: CustomTemplateCategory[]) {
  kvSet(CUSTOM_TEMPLATE_CATEGORIES_KEY, JSON.stringify(categories))
}

const RECENT_DOCUMENT_IDS_KEY = 'scribe-recent-document-ids'
const RECENTLY_CLOSED_IDS_KEY = 'scribe-recently-closed-ids'
const OPEN_DOCUMENT_IDS_KEY = 'scribe-open-document-ids'
const PINNED_DOCUMENT_IDS_KEY = 'scribe-pinned-document-ids'
export const RECENT_DOCUMENT_IDS_MAX = 20

function readIdList(key: string): string[] {
  try {
    const raw = kvGet(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
  } catch {
    return []
  }
}

function persistIdList(key: string, ids: string[], max = RECENT_DOCUMENT_IDS_MAX) {
  kvSet(key, JSON.stringify(ids.slice(0, max)))
}

export function readRecentDocumentIds(): string[] {
  return readIdList(RECENT_DOCUMENT_IDS_KEY).slice(0, RECENT_DOCUMENT_IDS_MAX)
}

export function persistRecentDocumentIds(ids: string[]) {
  persistIdList(RECENT_DOCUMENT_IDS_KEY, ids)
}

export function readRecentlyClosedIds(): string[] {
  return readIdList(RECENTLY_CLOSED_IDS_KEY).slice(0, RECENT_DOCUMENT_IDS_MAX)
}

export function persistRecentlyClosedIds(ids: string[]) {
  persistIdList(RECENTLY_CLOSED_IDS_KEY, ids)
}

export function readOpenDocumentIds(): string[] {
  return readIdList(OPEN_DOCUMENT_IDS_KEY)
}

export function persistOpenDocumentIds(ids: string[]) {
  persistIdList(OPEN_DOCUMENT_IDS_KEY, ids, 40)
}

export function readPinnedDocumentIds(): string[] {
  return readIdList(PINNED_DOCUMENT_IDS_KEY)
}

export function persistPinnedDocumentIds(ids: string[]) {
  persistIdList(PINNED_DOCUMENT_IDS_KEY, ids, 40)
}

/** Prepend `id` and dedupe, capped at max. */
export function pushRecentId(ids: string[], id: string, max = RECENT_DOCUMENT_IDS_MAX): string[] {
  return [id, ...ids.filter((existing) => existing !== id)].slice(0, max)
}
