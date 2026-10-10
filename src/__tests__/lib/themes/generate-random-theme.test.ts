import { describe, expect, it } from 'vitest'
import {
  generateRandomTheme,
  generateRandomThemeLocal,
} from '@/lib/themes/generate-random-theme'

describe('generateRandomTheme', () => {
  it('returns all required color fields', () => {
    const theme = generateRandomThemeLocal({ colorScheme: 'dark' })
    expect(theme.background).toMatch(/^#/)
    expect(theme.foreground).toMatch(/^#/)
    expect(theme.selectionStrong).toMatch(/^#/)
    expect(theme.border).toContain('rgba')
    expect(theme.sidebar).toContain('rgba')
    expect(theme.destructive).toMatch(/^#/)
  })

  it('generates light and dark themes', () => {
    const light = generateRandomThemeLocal({ colorScheme: 'light' })
    const dark = generateRandomThemeLocal({ colorScheme: 'dark' })

    expect(light.background).not.toEqual(dark.background)
    expect(light.foreground).not.toEqual(dark.foreground)
  })

  it('async entry falls back to local outside Tauri', async () => {
    const theme = await generateRandomTheme({ colorScheme: 'dark' })
    expect(theme.background).toMatch(/^#/)
  })
})
