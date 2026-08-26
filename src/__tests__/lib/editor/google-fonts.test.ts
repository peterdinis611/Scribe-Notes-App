import { describe, expect, it } from 'vitest'
import {
  CURATED_GOOGLE_FONTS,
  filterGoogleFonts,
  googleFontsCssUrl,
  googleFontsLinkTags,
  primaryFontFamilyName,
} from '@/lib/editor/google-fonts'

describe('google fonts helpers', () => {
  it('builds css2 urls', () => {
    expect(googleFontsCssUrl('Open Sans')).toContain('family=Open+Sans')
    expect(googleFontsCssUrl('Roboto')).toContain('fonts.googleapis.com/css2')
  })

  it('filters curated list', () => {
    expect(filterGoogleFonts([...CURATED_GOOGLE_FONTS], 'play').some((f) => f.includes('Playfair'))).toBe(
      true,
    )
  })

  it('emits link tags for families', () => {
    const html = googleFontsLinkTags(['Inter', '"Roboto", sans-serif'])
    expect(html).toContain('Inter')
    expect(html).toContain('Roboto')
    expect(primaryFontFamilyName('"Roboto", sans-serif')).toBe('Roboto')
  })
})
