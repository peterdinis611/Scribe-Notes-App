export type UiSkin = 'grove' | 'classic'

export const UI_SKIN_STORAGE_KEY = 'scribe-ui-skin'

export function isUiSkin(value: unknown): value is UiSkin {
  return value === 'grove' || value === 'classic'
}

/** Normalize legacy Copper Press / unknown values to Grove. */
export function normalizeUiSkin(value: unknown): UiSkin {
  if (value === 'classic') return 'classic'
  if (value === 'grove' || value === 'press') return 'grove'
  return 'grove'
}

export function applyUiSkin(skin: UiSkin) {
  const root = document.documentElement
  root.dataset.uiSkin = skin
}
