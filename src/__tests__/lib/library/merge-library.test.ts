import { describe, expect, it } from 'vitest'
import { mergeLibrarySummaries } from '@/lib/db/library-sync'
import type { DocumentSummary } from '@/lib/db/api'

function summary(id: string, updatedAt: number): DocumentSummary {
  return {
    id,
    title: `Doc ${id}`,
    updatedAt,
    createdAt: updatedAt,
    deletedAt: null,
    folderId: null,
    filePath: null,
    isFavorite: false,
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
})
