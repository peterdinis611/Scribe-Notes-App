import { describe, expect, it } from 'vitest'
import { generateRandomTheme } from '@/lib/themes/generate-random-theme'

describe('generateRandomTheme', () => {
  it('returns all required color fields', () => {
    const theme = generateRandomTheme({ colorScheme: 'dark' })
    expect(theme.background).toMatch(/^#/)
    expect(theme.foreground).toMatch(/^#/)
    expect(theme.selectionStrong).toMatch(/^#/)
    expect(theme.border).toContain('rgba')
    expect(theme.sidebar).toContain('rgba')
    expect(theme.destructive).toMatch(/^#/)
  })

  it('generates light and dark themes', () => {
    const light = generateRandomTheme({ colorScheme: 'light' })
    const dark = generateRandomTheme({ colorScheme: 'dark' })

    expect(light.background).not.toEqual(dark.background)
    expect(light.foreground).not.toEqual(dark.foreground)
  })
})
