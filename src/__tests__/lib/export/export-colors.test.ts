import { describe, expect, it } from 'vitest'
import { colorForExport } from '@/lib/export/export-colors'

describe('colorForExport', () => {
  it('keeps high-contrast colors', () => {
    expect(colorForExport('#111111', '#ffffff')).toBe('#111111')
    expect(colorForExport('#000000', '#ffffff')).toBe('#000000')
  })

  it('lifts low-contrast light text on white background', () => {
    expect(colorForExport('#eeeeee', '#ffffff')).toBe('#111111')
    expect(colorForExport('#f5f5f5', '#ffffff')).toBe('#111111')
  })

  it('returns original for transparent / unparsable colors', () => {
    expect(colorForExport('rgba(0,0,0,0.05)')).toBe('rgba(0,0,0,0.05)')
    expect(colorForExport('not-a-color')).toBe('not-a-color')
  })

  it('accepts short hex and rgb()', () => {
    expect(colorForExport('#000', '#fff')).toBe('#000')
    expect(colorForExport('rgb(17, 17, 17)', '#ffffff')).toBe('rgb(17, 17, 17)')
  })
})
