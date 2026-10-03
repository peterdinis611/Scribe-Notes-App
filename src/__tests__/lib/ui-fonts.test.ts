import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_UI_FONT_SETTINGS,
  UI_FONT_PRESETS,
  applyUiFontSettings,
  customUiFontChoice,
  googleUiFontChoice,
  patchUiFontSettings,
  readUiFontSettings,
} from '@/lib/ui-fonts'

vi.mock('@/lib/storage/kv', () => {
  const store = new Map<string, string>()
  return {
    kvGet: (key: string) => store.get(key) ?? null,
    kvSet: (key: string, value: string) => {
      store.set(key, value)
    },
    __store: store,
  }
})

vi.mock('@/lib/editor/google-fonts', () => ({
  ensureGoogleFontLoaded: vi.fn(),
  ensureGoogleFontLoadedAsync: vi.fn(async () => undefined),
  isKnownGoogleFont: () => false,
}))

vi.mock('@/lib/editor/custom-fonts', () => ({
  ensureCustomFontLoaded: vi.fn(),
  isCustomFontFamily: () => false,
}))

describe('ui-fonts', () => {
  beforeEach(async () => {
    const { __store } = (await import('@/lib/storage/kv')) as unknown as {
      __store: Map<string, string>
    }
    __store.clear()
    document.documentElement.style.removeProperty('--font-sans')
    document.documentElement.style.removeProperty('--font-display')
  })

  it('exposes Aa presets including readable', () => {
    expect(UI_FONT_PRESETS.map((item) => item.id)).toContain('readable')
    expect(UI_FONT_PRESETS.every((item) => item.sample === 'Aa')).toBe(true)
  })

  it('defaults and persists a UI font pair', () => {
    expect(readUiFontSettings()).toEqual(DEFAULT_UI_FONT_SETTINGS)
    const next = patchUiFontSettings({ sans: 'serif', display: 'literary' })
    expect(next.sans).toBe('serif')
    expect(readUiFontSettings().display).toBe('literary')
  })

  it('applies CSS variables for a preset', () => {
    applyUiFontSettings({ sans: 'mono', display: 'system' })
    expect(document.documentElement.style.getPropertyValue('--font-sans')).toContain('IBM Plex Mono')
    expect(document.documentElement.dataset.uiFontSans).toBe('mono')
  })

  it('builds custom and google choice ids', () => {
    expect(customUiFontChoice('My Face')).toBe('custom:My Face')
    expect(googleUiFontChoice('Lexend')).toBe('google:Lexend')
  })
})
