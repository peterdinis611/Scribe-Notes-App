import { describe, expect, it } from 'vitest'
import { cropAspectRatio, initialPercentCrop } from '@/lib/editor/image-crop'
import { highlighterLanguage } from '@/lib/editor/syntax-highlight'

describe('initialPercentCrop', () => {
  it('centers a free crop', () => {
    const crop = initialPercentCrop(800, 600)
    expect(crop.unit).toBe('%')
    expect(crop.width).toBe(84)
    expect(crop.height).toBe(84)
    expect(crop.x).toBeCloseTo(8)
    expect(crop.y).toBeCloseTo(8)
  })

  it('locks square aspect', () => {
    const crop = initialPercentCrop(800, 400, cropAspectRatio('square'))
    expect(crop.width).toBeCloseTo(50)
    expect(crop.height).toBeCloseTo(100)
    expect(crop.x).toBeCloseTo(25)
    expect(crop.y).toBeCloseTo(0)
  })
})

describe('highlighterLanguage', () => {
  it('omits auto and plaintext', () => {
    expect(highlighterLanguage(null)).toBeUndefined()
    expect(highlighterLanguage('auto')).toBeUndefined()
    expect(highlighterLanguage('plaintext')).toBeUndefined()
  })

  it('maps aliases to highlight.js ids', () => {
    expect(highlighterLanguage('js')).toBe('javascript')
    expect(highlighterLanguage('html')).toBe('xml')
    expect(highlighterLanguage('py')).toBe('python')
  })
})
