import { describe, expect, it } from 'vitest'
import { buildRevisionCompareOptions, normalizeComparePair } from '@/lib/revisions/revision-compare'
import { CURRENT_REVISION_ID } from '@/lib/revisions/diff-text'

const baseRevision = {
  documentId: 'doc-1',
  label: null as string | null,
  pinned: false,
}

describe('revision compare helpers', () => {
  it('builds options with current version first', () => {
    const options = buildRevisionCompareOptions(
      [{ ...baseRevision, id: 'rev-1', title: 'Verzia 1', createdAt: 100 }],
      200,
    )
    expect(options[0]?.id).toBe(CURRENT_REVISION_ID)
    expect(options).toHaveLength(2)
  })

  it('prefers named labels over document title', () => {
    const options = buildRevisionCompareOptions(
      [
        {
          ...baseRevision,
          id: 'rev-1',
          title: 'Doc title',
          label: 'Release candidate',
          createdAt: 100,
        },
      ],
      200,
    )
    expect(options[1]?.label).toBe('Release candidate')
  })

  it('orders older and newer versions', () => {
    const revisions = [
      { ...baseRevision, id: 'rev-new', title: 'Nová', createdAt: 200 },
      { ...baseRevision, id: 'rev-old', title: 'Stará', createdAt: 100 },
    ]

    expect(normalizeComparePair('rev-new', 'rev-old', revisions, 300)).toEqual({
      olderId: 'rev-old',
      newerId: 'rev-new',
    })
  })
})
