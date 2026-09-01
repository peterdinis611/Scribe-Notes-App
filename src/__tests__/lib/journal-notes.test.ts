import { describe, expect, it } from 'vitest'
import { collectJournalDocumentIdsForRange } from '@/lib/journal-notes'
import type { DocumentSummary } from '@/lib/db/api'
import { kvSet } from '@/lib/storage/kv'

function summary(
  id: string,
  title: string,
  overrides: Partial<DocumentSummary> = {},
): DocumentSummary {
  return {
    id,
    title,
    updatedAt: 1_700_000_000,
    createdAt: 1_700_000_000,
    deletedAt: null,
    folderId: null,
    filePath: null,
    isFavorite: false,
    isPinned: false,
    tags: [],
    ...overrides,
  }
}

describe('collectJournalDocumentIdsForRange', () => {
  it('includes mapped daily journal ids in range', () => {
    kvSet('scribe-journal-map', JSON.stringify({ 'daily:2026-09-01': 'doc-a' }))
    const ids = collectJournalDocumentIdsForRange(
      [summary('doc-a', 'Morning', { updatedAt: 1_700_000_000 })],
      null,
      '2026-09-01',
      '2026-09-07',
    )
    expect(ids).toContain('doc-a')
  })

  it('includes journal folder docs updated in range', () => {
    const ids = collectJournalDocumentIdsForRange(
      [
        summary('doc-b', 'Custom title', {
          folderId: 'journal-folder',
          updatedAt: Math.floor(new Date('2026-09-03T12:00:00').getTime() / 1000),
        }),
      ],
      'journal-folder',
      '2026-09-01',
      '2026-09-07',
    )
    expect(ids).toContain('doc-b')
  })
})
