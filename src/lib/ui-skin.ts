import { normalizeUiSkinNative } from '@/lib/db/api'
import { isTauriRuntime } from '@/lib/tauri'

export type UiSkin = 'page' | 'grove' | 'classic'

export const UI_SKIN_STORAGE_KEY = 'scribe-ui-skin'
/** Bump when the default chrome language changes so installs land on Page. */
export const UI_SKIN_MIGRATED_PAGE_KEY = 'scribe-ui-skin-migrated-page-v2'

/** Keep in sync with `scribe_ui::ui_skin_ids`. */
export const UI_SKIN_IDS = ['page', 'grove', 'classic'] as const

export function isUiSkin(value: unknown): value is UiSkin {
  return value === 'page' || value === 'grove' || value === 'classic'
}

/** Normalize legacy Copper Press / unknown values to Page. */
export function normalizeUiSkin(value: unknown): UiSkin {
  if (value === 'classic') return 'classic'
  if (value === 'grove' || value === 'press') return 'grove'
  if (value === 'page') return 'page'
  return 'page'
}

/** Prefer Rust `scribe-ui` when running under Tauri; otherwise JS fallback. */
export async function normalizeUiSkinAsync(value: unknown): Promise<UiSkin> {
  if (isTauriRuntime() && typeof value === 'string') {
    try {
      const next = await normalizeUiSkinNative(value)
      if (isUiSkin(next)) return next
    } catch {
      // Fall through.
    }
  }
  return normalizeUiSkin(value)
}

export function applyUiSkin(skin: UiSkin) {
  const root = document.documentElement
  root.dataset.uiSkin = skin
}

/**
 * One-time migrate previous default (Grove / unset) → Page so the redesign lands.
 * Classic stays; after migration, an explicit Grove choice is respected.
 */
export function resolveStoredUiSkin(
  get: (k: string) => string | null,
  set: (k: string, v: string) => void,
): UiSkin {
  try {
    const raw = get(UI_SKIN_STORAGE_KEY)
    if (get(UI_SKIN_MIGRATED_PAGE_KEY) === '1') {
      return normalizeUiSkin(raw)
    }
    set(UI_SKIN_MIGRATED_PAGE_KEY, '1')
    if (raw === 'classic') return 'classic'
    set(UI_SKIN_STORAGE_KEY, 'page')
    return 'page'
  } catch {
    return 'page'
  }
}
