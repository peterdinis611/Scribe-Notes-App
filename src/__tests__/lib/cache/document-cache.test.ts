import { afterEach, describe, expect, it } from 'vitest'
import type { Document } from '@/lib/db/api'
import {
  cacheDocument,
  clearDocumentCache,
  getCachedContentHash,
  getCachedParsedContent,
  hashContent,
  invalidateDocumentCache,
  peekCachedDocument,
} from '@/lib/cache/document-cache'

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    title: 'Test',
    contentJson: JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    }),
    folderId: null,
    filePath: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

afterEach(() => {
  clearDocumentCache()
})

describe('hashContent', () => {
  it('returns stable hash for same input', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'))
    expect(hashContent('abc')).not.toBe(hashContent('abcd'))
  })
})

describe('document cache', () => {
  it('stores and retrieves documents', () => {
    const doc = makeDocument()
    cacheDocument(doc)
    expect(peekCachedDocument('doc-1')?.title).toBe('Test')
  })

  it('parses json once and reuses parsed content', () => {
    const doc = makeDocument()
    const parsed = getCachedParsedContent(doc)
    expect(parsed.type).toBe('doc')

    const updated = makeDocument({
      title: 'Updated title',
      updatedAt: 2,
    })
    cacheDocument(updated)

    const cachedParsed = getCachedParsedContent(updated)
    expect(cachedParsed).toBe(parsed)
  })

  it('invalidates single entries', () => {
    cacheDocument(makeDocument())
    invalidateDocumentCache('doc-1')
    expect(peekCachedDocument('doc-1')).toBeNull()
  })

  it('tracks content hash', () => {
    const doc = makeDocument()
    const hash = getCachedContentHash(doc)
    expect(hash).toBe(hashContent(doc.contentJson))
  })
})
