import { describe, expect, it } from 'vitest'
import { resolveLibraryEditorDocumentId } from '@/lib/libraries/switch'
import type { DocumentSummary } from '@/lib/db/api'

function doc(id: string, extra: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id,
    title: id,
    folderId: null,
    filePath: null,
    updatedAt: 1,
    isFavorite: false,
    isPinned: false,
    tags: [],
    deletedAt: null,
    ...extra,
  }
}

describe('resolveLibraryEditorDocumentId', () => {
  it('keeps the restored active document when it is still in the library', () => {
    expect(
      resolveLibraryEditorDocumentId({
        documents: [doc('a'), doc('b')],
        activeDocumentId: 'b',
        openDocumentIds: ['a', 'b'],
        recentDocumentIds: ['a'],
      }),
    ).toBe('b')
  })

  it('falls back to an open tab, then recents, then the newest library note', () => {
    expect(
      resolveLibraryEditorDocumentId({
        documents: [doc('fresh'), doc('older')],
        activeDocumentId: 'gone',
        openDocumentIds: ['stale', 'fresh'],
        recentDocumentIds: [],
      }),
    ).toBe('fresh')

    expect(
      resolveLibraryEditorDocumentId({
        documents: [doc('fresh'), doc('older')],
        activeDocumentId: null,
        openDocumentIds: [],
        recentDocumentIds: ['older'],
      }),
    ).toBe('older')

    expect(
      resolveLibraryEditorDocumentId({
        documents: [doc('fresh'), doc('older')],
        activeDocumentId: null,
        openDocumentIds: [],
        recentDocumentIds: [],
      }),
    ).toBe('fresh')
  })

  it('returns null when the library is empty', () => {
    expect(
      resolveLibraryEditorDocumentId({
        documents: [doc('trashed', { deletedAt: 9 })],
        activeDocumentId: 'trashed',
        openDocumentIds: ['trashed'],
        recentDocumentIds: [],
      }),
    ).toBeNull()
  })
})
