import { describe, expect, it } from 'vitest'
import { isOpenLibraryDocumentId } from '@/lib/trash-document'
import type { DocumentSummary } from '@/lib/db/api'

function summary(id: string, deletedAt: number | null = null): DocumentSummary {
  return {
    id,
    title: `Doc ${id}`,
    updatedAt: 1,
    folderId: null,
    filePath: null,
    isFavorite: false,
    isPinned: false,
    tags: [],
    deletedAt,
  }
}

describe('isOpenLibraryDocumentId', () => {
  it('returns true for visible documents', () => {
    expect(isOpenLibraryDocumentId([summary('a')], 'a')).toBe(true)
  })

  it('returns false for missing or trashed documents', () => {
    expect(isOpenLibraryDocumentId([summary('a')], 'b')).toBe(false)
    expect(isOpenLibraryDocumentId([summary('a', 99)], 'a')).toBe(false)
    expect(isOpenLibraryDocumentId([summary('a')], null)).toBe(false)
  })
})
