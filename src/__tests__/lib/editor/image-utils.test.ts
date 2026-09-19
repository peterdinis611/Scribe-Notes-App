import { describe, expect, it } from 'vitest'
import { isLikelyImageUrl } from '@/lib/editor/image-utils'

describe('isLikelyImageUrl', () => {
  it('accepts common image extensions', () => {
    expect(isLikelyImageUrl('https://cdn.example.com/photo.png')).toBe(true)
    expect(isLikelyImageUrl('https://cdn.example.com/a/b.jpeg?w=800')).toBe(true)
    expect(isLikelyImageUrl('https://cdn.example.com/x.webp#frag')).toBe(true)
    expect(isLikelyImageUrl('https://cdn.example.com/loop.gif')).toBe(true)
  })

  it('accepts known image hosts without extension', () => {
    expect(isLikelyImageUrl('https://images.unsplash.com/photo-123')).toBe(true)
    expect(isLikelyImageUrl('https://i.imgur.com/abc')).toBe(true)
  })

  it('rejects non-http and non-image urls', () => {
    expect(isLikelyImageUrl('ftp://x.com/a.png')).toBe(false)
    expect(isLikelyImageUrl('https://example.com/page')).toBe(false)
    expect(isLikelyImageUrl('not a url')).toBe(false)
  })
})
