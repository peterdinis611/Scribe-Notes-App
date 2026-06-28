import { describe, expect, it } from 'vitest'
import { buildRevisionCompareOptions, normalizeComparePair } from '@/lib/revisions/revision-compare'
import { CURRENT_REVISION_ID } from '@/lib/revisions/diff-text'

describe('revision compare helpers', () => {
  it('builds options with current version first', () => {
    const options = buildRevisionCompareOptions(
      [{ id: 'rev-1', documentId: 'doc-1', title: 'Verzia 1', createdAt: 100 }],
      200,
    )
    expect(options[0]?.id).toBe(CURRENT_REVISION_ID)
    expect(options).toHaveLength(2)
  })

  it('orders older and newer versions', () => {
    const revisions = [
      { id: 'rev-new', documentId: 'doc-1', title: 'Nová', createdAt: 200 },
      { id: 'rev-old', documentId: 'doc-1', title: 'Stará', createdAt: 100 },
    ]

    expect(
      normalizeComparePair('rev-new', 'rev-old', revisions, 300),
    ).toEqual({ olderId: 'rev-old', newerId: 'rev-new' })
  })
})
