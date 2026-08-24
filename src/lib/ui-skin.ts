export type UiSkin = 'classic' | 'press'

export const UI_SKIN_STORAGE_KEY = 'scribe-ui-skin'

export function isUiSkin(value: unknown): value is UiSkin {
  return value === 'classic' || value === 'press'
}

export function applyUiSkin(skin: UiSkin) {
  const root = document.documentElement
  root.dataset.uiSkin = skin
}
