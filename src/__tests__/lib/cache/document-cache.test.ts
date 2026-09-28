import { afterEach, describe, expect, it } from 'vitest'
import type { Document } from '@/lib/db/api'
import {
  cacheDocument,
  clearDocumentCache,
  getCachedContentHash,
  getCachedDocument,
  getCachedParsedContent,
  getDocumentCacheSize,
  getDocumentCacheStats,
  hashContent,
  invalidateDocumentCache,
  isCachedFresh,
  isCachedRecent,
  patchCachedDocument,
  peekCachedDocument,
  peekCachedParsedContent,
  resetDocumentCacheStats,
  setRetainedDocumentIds,
  subscribeDocumentCache,
} from '@/lib/cache/document-cache'
import { LruCache } from '@/lib/cache/lru-cache'

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
  setRetainedDocumentIds([])
  clearDocumentCache()
  resetDocumentCacheStats()
})

describe('hashContent', () => {
  it('returns stable hash for same input', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'))
    expect(hashContent('abc')).not.toBe(hashContent('abcd'))
  })
})

describe('LruCache', () => {
  it('evicts oldest then largest under byte pressure', () => {
    const lru = new LruCache<string>({
      maxEntries: 10,
      targetEntries: 8,
      maxBytes: 20,
      targetBytes: 12,
      sizeof: (value) => value.length,
    })
    lru.set('a', 'aaaa')
    lru.set('b', 'bbbb')
    lru.set('c', 'cccccccccccc')
    lru.set('d', 'dddd')
    expect(lru.byteSize).toBeLessThanOrEqual(20)
    expect(lru.has('c')).toBe(false)
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

  it('uses metadata identity for large content hashes', () => {
    const huge = 'x'.repeat(400_001)
    const doc = makeDocument({
      contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'text', text: huge }] }),
      updatedAt: 42,
    })
    const hash = getCachedContentHash(doc)
    expect(hash.startsWith('u:doc-1:42:')).toBe(true)
    expect(getCachedContentHash(doc)).toBe(hash)
  })

  it('reuses parse when contentJson string is shared', () => {
    const doc = makeDocument()
    const parsed = getCachedParsedContent(doc)
    const renamed = { ...doc, title: 'Renamed', updatedAt: 9 }
    cacheDocument(renamed)
    expect(peekCachedParsedContent('doc-1')).toBe(parsed)
  })

  it('patches metadata without reparsing', () => {
    const parsed = getCachedParsedContent(makeDocument())
    const next = patchCachedDocument('doc-1', { title: 'Patched', updatedAt: 99 })
    expect(next?.title).toBe('Patched')
    expect(peekCachedParsedContent('doc-1')).toBe(parsed)
    expect(isCachedFresh('doc-1', 99)).toBe(true)
  })

  it('tracks freshness helpers', () => {
    cacheDocument(makeDocument({ updatedAt: 7 }))
    expect(isCachedFresh('doc-1', 7)).toBe(true)
    expect(isCachedFresh('doc-1', 8)).toBe(false)
    expect(isCachedRecent('doc-1', 60_000)).toBe(true)
  })

  it('notifies subscribers on put and invalidate', () => {
    const events: string[] = []
    const unsubscribe = subscribeDocumentCache((event) => {
      events.push(`${event.type}:${event.id ?? ''}`)
    })
    cacheDocument(makeDocument())
    invalidateDocumentCache('doc-1')
    unsubscribe()
    expect(events).toContain('put:doc-1')
    expect(events).toContain('invalidate:doc-1')
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

  it('evicts oldest non-retained entries beyond capacity', () => {
    for (let i = 0; i < 72; i += 1) {
      cacheDocument(
        makeDocument({
          id: `doc-${i}`,
          contentJson: JSON.stringify({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: `n${i}` }] }],
          }),
        }),
      )
    }
    expect(getDocumentCacheSize()).toBeLessThanOrEqual(56)
    expect(peekCachedDocument('doc-0')).toBeNull()
    expect(peekCachedDocument('doc-71')).not.toBeNull()
  })

  it('never evicts retained document ids', () => {
    setRetainedDocumentIds(['doc-keep'])
    cacheDocument(
      makeDocument({
        id: 'doc-keep',
        contentJson: JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'keep' }] }],
        }),
      }),
    )
    for (let i = 0; i < 72; i += 1) {
      cacheDocument(
        makeDocument({
          id: `doc-${i}`,
          contentJson: JSON.stringify({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: `n${i}` }] }],
          }),
        }),
      )
    }
    expect(peekCachedDocument('doc-keep')).not.toBeNull()
  })

  it('promotes a touched document so LRU eviction skips it', () => {
    for (let i = 0; i < 56; i += 1) {
      cacheDocument(
        makeDocument({
          id: `doc-${i}`,
          contentJson: JSON.stringify({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: `n${i}` }] }],
          }),
        }),
      )
    }
    expect(getCachedDocument('doc-0')).not.toBeNull()
    for (let i = 56; i < 72; i += 1) {
      cacheDocument(
        makeDocument({
          id: `doc-${i}`,
          contentJson: JSON.stringify({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: `n${i}` }] }],
          }),
        }),
      )
    }
    expect(peekCachedDocument('doc-0')).not.toBeNull()
    expect(peekCachedDocument('doc-1')).toBeNull()
    expect(peekCachedDocument('doc-71')).not.toBeNull()
  })

  it('exposes cache stats', () => {
    cacheDocument(makeDocument())
    peekCachedDocument('doc-1')
    peekCachedDocument('missing')
    const stats = getDocumentCacheStats()
    expect(stats.size).toBe(1)
    expect(stats.hits).toBeGreaterThanOrEqual(1)
    expect(stats.misses).toBeGreaterThanOrEqual(1)
  })

  it('reparses when content actually changes', () => {
    const first = getCachedParsedContent(makeDocument())
    const second = getCachedParsedContent(
      makeDocument({
        contentJson: JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Changed' }] }],
        }),
      }),
    )
    expect(second).not.toBe(first)
    expect(JSON.stringify(second)).toContain('Changed')
  })
})
