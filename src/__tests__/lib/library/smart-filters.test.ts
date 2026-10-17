import { describe, expect, it } from 'vitest'
import { documentMatchesSmartFilter } from '@/lib/library/smart-filters'
import type { DocumentSummary } from '@/lib/db/api'

function doc(partial: Partial<DocumentSummary> & { id: string }): DocumentSummary {
  return {
    title: partial.title ?? partial.id,
    updatedAt: 1,
    folderId: null,
    filePath: null,
    isFavorite: false,
    isPinned: false,
    tags: [],
    deletedAt: null,
    ...partial,
  }
}

describe('documentMatchesSmartFilter', () => {
  it('passes everything for none', () => {
    expect(documentMatchesSmartFilter(doc({ id: 'a', deletedAt: 9 }), 'none')).toBe(true)
  })

  it('hides trashed docs for active filters', () => {
    expect(documentMatchesSmartFilter(doc({ id: 'a', deletedAt: 1 }), 'untagged')).toBe(false)
  })

  it('matches untagged documents', () => {
    expect(documentMatchesSmartFilter(doc({ id: 'a', tags: [] }), 'untagged')).toBe(true)
    expect(documentMatchesSmartFilter(doc({ id: 'a', tags: ['x'] }), 'untagged')).toBe(false)
  })

  it('matches unlinked orphans', () => {
    const orphanIds = new Set(['a'])
    expect(documentMatchesSmartFilter(doc({ id: 'a' }), 'unlinked', { orphanIds })).toBe(true)
    expect(documentMatchesSmartFilter(doc({ id: 'b' }), 'unlinked', { orphanIds })).toBe(false)
    expect(documentMatchesSmartFilter(doc({ id: 'a' }), 'unlinked', {})).toBe(false)
  })

  it('matches unread against recent ids', () => {
    expect(
      documentMatchesSmartFilter(doc({ id: 'a' }), 'unread', { recentDocumentIds: ['b'] }),
    ).toBe(true)
    expect(
      documentMatchesSmartFilter(doc({ id: 'a' }), 'unread', { recentDocumentIds: ['a'] }),
    ).toBe(false)
  })

  it('matches known canvas documents', () => {
    const canvasIds = new Set(['c1'])
    expect(documentMatchesSmartFilter(doc({ id: 'c1' }), 'canvas', { canvasIds })).toBe(true)
    expect(documentMatchesSmartFilter(doc({ id: 'c2' }), 'canvas', { canvasIds })).toBe(false)
    expect(documentMatchesSmartFilter(doc({ id: 'c1' }), 'canvas', {})).toBe(false)
  })

  it('matches stubs, tasks, and media sets', () => {
    expect(documentMatchesSmartFilter(doc({ id: 's1' }), 'stubs', { stubIds: new Set(['s1']) })).toBe(true)
    expect(documentMatchesSmartFilter(doc({ id: 't1' }), 'tasks', { taskDocIds: new Set(['t1']) })).toBe(true)
    expect(documentMatchesSmartFilter(doc({ id: 'm1' }), 'media', { mediaDocIds: new Set(['m1']) })).toBe(true)
    expect(documentMatchesSmartFilter(doc({ id: 'x' }), 'media', { mediaDocIds: new Set(['m1']) })).toBe(false)
  })
})
