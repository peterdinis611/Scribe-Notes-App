import { describe, expect, it } from 'vitest'
import { parseScribeDeepLink } from '@/lib/deep-links'

describe('clip deep links', () => {
  it('parses scribe://clip query params', () => {
    const link = parseScribeDeepLink(
      'scribe://clip?url=https%3A%2F%2Fexample.com&title=Hello&text=Body',
    )
    expect(link).toEqual({
      kind: 'clip',
      url: 'https://example.com',
      title: 'Hello',
      text: 'Body',
    })
  })
})
