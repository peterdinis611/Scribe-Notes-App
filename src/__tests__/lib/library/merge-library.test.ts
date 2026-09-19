import { describe, expect, it } from 'vitest'
import {
  documentToSummary,
  isLibraryDocumentVisible,
  mergeLibrarySummaries,
  prependDocumentSummary,
  visibleLibraryDocuments,
} from '@/lib/db/library-sync'
import type { Document, DocumentSummary } from '@/lib/db/api'

function summary(id: string, updatedAt: number, extra: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id,
    title: `Doc ${id}`,
    updatedAt,
    deletedAt: null,
    folderId: null,
    filePath: null,
    isFavorite: false,
    isPinned: false,
    tags: [],
    ...extra,
  }
}

function document(id: string, title: string): Document {
  return {
    id,
    title,
    contentJson: '{"type":"doc","content":[]}',
    folderId: null,
    filePath: null,
    createdAt: 1,
    updatedAt: 200,
  }
}

describe('mergeLibrarySummaries', () => {
  it('keeps optimistic docs missing from fetched snapshot', () => {
    const current = [summary('new-doc', 200)]
    const fetched = [summary('seeded', 100)]

    const merged = mergeLibrarySummaries(current, fetched)

    expect(merged.map((doc) => doc.id)).toEqual(['new-doc', 'seeded'])
  })

  it('prefers fetched data for docs present in both lists', () => {
    const current = [{ ...summary('shared', 50), title: 'Stale title' }]
    const fetched = [{ ...summary('shared', 150), title: 'Fresh title' }]

    const merged = mergeLibrarySummaries(current, fetched)

    expect(merged).toHaveLength(1)
    expect(merged[0]?.title).toBe('Fresh title')
    expect(merged[0]?.updatedAt).toBe(150)
  })

  it('drops trashed docs from both lists', () => {
    const current = [summary('gone', 300, { deletedAt: 9 })]
    const fetched = [summary('kept', 100), summary('trashed', 200, { deletedAt: 8 })]
    expect(mergeLibrarySummaries(current, fetched).map((doc) => doc.id)).toEqual(['kept'])
  })
})

describe('library document helpers', () => {
  it('hides soft-deleted rows', () => {
    const open = summary('open', 1)
    const trashed = summary('gone', 2, { deletedAt: 99 })
    expect(isLibraryDocumentVisible(open)).toBe(true)
    expect(isLibraryDocumentVisible(trashed)).toBe(false)
    expect(visibleLibraryDocuments([open, trashed])).toEqual([open])
  })

  it('maps a document onto a summary and prepends it', () => {
    const existing = summary('old', 10)
    const created = document('new', 'Compiled')
    const mapped = documentToSummary(created, {
      ...summary('new', 1),
      isFavorite: true,
      tags: ['book'],
    })
    expect(mapped).toMatchObject({
      id: 'new',
      title: 'Compiled',
      isFavorite: true,
      tags: ['book'],
      deletedAt: null,
    })

    const next = prependDocumentSummary([existing], created)
    expect(next.map((doc) => doc.id)).toEqual(['new', 'old'])
  })

  it('replaces an existing summary when prepending the same id', () => {
    const current = [summary('new', 10, { title: 'Stale' })]
    const next = prependDocumentSummary(current, document('new', 'Fresh'))
    expect(next).toHaveLength(1)
    expect(next[0]?.title).toBe('Fresh')
  })
})
