import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyCustomFontFamily,
  familyNameFromFileName,
  fontFormatFromFileName,
  listCustomFonts,
} from '@/lib/editor/custom-fonts'
import { resetKvStoreForTests } from '@/lib/storage/kv'

describe('custom fonts helpers', () => {
  beforeEach(async () => {
    await resetKvStoreForTests()
  })

  it('detects formats from file names', () => {
    expect(fontFormatFromFileName('Display.woff2')).toBe('woff2')
    expect(fontFormatFromFileName('Body.TTF')).toBe('truetype')
    expect(fontFormatFromFileName('Title.otf')).toBe('opentype')
    expect(fontFormatFromFileName('notes.txt')).toBeNull()
  })

  it('builds a readable family name from the file name', () => {
    expect(familyNameFromFileName('source-serif-4.ttf')).toBe('Source Serif 4')
    expect(familyNameFromFileName('MyFont.woff2')).toBe('MyFont')
  })

  it('formats uploaded family for CSS', () => {
    expect(applyCustomFontFamily('Source Serif 4')).toBe('"Source Serif 4"')
  })

  it('starts with an empty registry', () => {
    expect(listCustomFonts()).toEqual([])
  })
})
