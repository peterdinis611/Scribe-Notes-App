import { describe, expect, it } from 'vitest'
import { getFontFamilyLabel, normalizeFontFamily } from '@/lib/editor/font-family'

describe('font family helpers', () => {
  it('normalizes quoted font stacks', () => {
    expect(normalizeFontFamily('Georgia, "Times New Roman", serif')).toBe(
      'georgia, times new roman, serif',
    )
  })

  it('resolves known labels', () => {
    expect(getFontFamilyLabel('Georgia, Times New Roman, serif')).toBe('Georgia')
    expect(getFontFamilyLabel('')).toBe('Predvolená')
    expect(getFontFamilyLabel('Unknown Font')).toBe('Predvolená')
  })
})
