import { normalizeUiSkinNative } from '@/lib/db/api'
import { isTauriRuntime } from '@/lib/tauri'

export type UiSkin = 'grove' | 'classic'

export const UI_SKIN_STORAGE_KEY = 'scribe-ui-skin'

/** Keep in sync with `scribe_ui::ui_skin_ids`. */
export const UI_SKIN_IDS = ['grove', 'classic'] as const

export function isUiSkin(value: unknown): value is UiSkin {
  return value === 'grove' || value === 'classic'
}

/** Normalize legacy Copper Press / unknown values to Grove. */
export function normalizeUiSkin(value: unknown): UiSkin {
  if (value === 'classic') return 'classic'
  if (value === 'grove' || value === 'press') return 'grove'
  return 'grove'
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
