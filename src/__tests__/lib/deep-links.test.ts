import { describe, expect, it } from 'vitest'
import { parseScribeDeepLink } from '@/lib/deep-links'

describe('parseScribeDeepLink', () => {
  it('parses doc / artifact / revision hosts', () => {
    expect(parseScribeDeepLink('scribe://doc/abc')).toEqual({ kind: 'doc', documentId: 'abc' })
    expect(parseScribeDeepLink('scribe://artifact/art-1')).toEqual({
      kind: 'artifact',
      artifactId: 'art-1',
    })
    expect(parseScribeDeepLink('scribe://revision/doc-1/rev-2')).toEqual({
      kind: 'revision',
      documentId: 'doc-1',
      revisionId: 'rev-2',
    })
  })

  it('parses path-style scribe:///doc/id', () => {
    expect(parseScribeDeepLink('scribe:///doc/xyz')).toEqual({ kind: 'doc', documentId: 'xyz' })
  })

  it('rejects non-scribe URLs', () => {
    expect(parseScribeDeepLink('https://example.com')).toBeNull()
    expect(parseScribeDeepLink('')).toBeNull()
  })
})
