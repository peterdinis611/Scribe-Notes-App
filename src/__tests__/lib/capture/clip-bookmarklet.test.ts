import { describe, expect, it } from 'vitest'
import { buildClipBookmarklet } from '@/lib/capture/clip-bookmarklet'

describe('clip bookmarklet', () => {
  it('builds a javascript: bookmark that opens scribe://clip', () => {
    const code = buildClipBookmarklet()
    expect(code.startsWith('javascript:')).toBe(true)
    expect(decodeURIComponent(code.slice('javascript:'.length))).toContain('scribe://clip?')
  })
})
