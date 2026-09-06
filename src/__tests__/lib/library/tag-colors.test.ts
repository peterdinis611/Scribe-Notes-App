import { describe, expect, it } from 'vitest'
import { colorForTag } from '@/lib/library/tag-colors'

describe('colorForTag', () => {
  it('returns stable hsl for the same tag', () => {
    expect(colorForTag('journal')).toBe(colorForTag('journal'))
    expect(colorForTag('journal')).toMatch(/^hsl\(\d+ 52% 52%\)$/)
  })

  it('varies hue for different tags', () => {
    expect(colorForTag('alpha')).not.toBe(colorForTag('beta'))
  })
})
