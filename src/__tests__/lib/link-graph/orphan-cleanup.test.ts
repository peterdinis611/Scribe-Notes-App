import { describe, expect, it } from 'vitest'
import {
  isUntitledOrphanTitle,
  partitionOrphans,
  suggestOrphanLinks,
} from '@/lib/link-graph/orphan-cleanup'

describe('orphan-cleanup', () => {
  it('detects untitled titles', () => {
    expect(isUntitledOrphanTitle('')).toBe(true)
    expect(isUntitledOrphanTitle('Bez názvu')).toBe(true)
    expect(isUntitledOrphanTitle('Untitled')).toBe(true)
    expect(isUntitledOrphanTitle('Meeting notes')).toBe(false)
  })

  it('partitions untitled orphans', () => {
    const { untitled, named } = partitionOrphans([
      { id: 'a', title: 'Bez názvu' },
      { id: 'b', title: 'Project' },
      { id: 'c', title: 'Untitled' },
    ])
    expect(untitled.map((item) => item.id)).toEqual(['a', 'c'])
    expect(named.map((item) => item.id)).toEqual(['b'])
  })

  it('suggests best similar link per orphan', () => {
    const suggestions = suggestOrphanLinks([
      {
        id: 'o1',
        title: 'Orphan',
        similar: [
          { documentId: 'o1', title: 'self', rank: 1, snippet: '' },
          { documentId: 't1', title: 'Target', rank: 0.8, snippet: '' },
        ],
      },
    ])
    expect(suggestions).toEqual([
      {
        orphanId: 'o1',
        orphanTitle: 'Orphan',
        targetId: 't1',
        targetTitle: 'Target',
        rank: 0.8,
      },
    ])
  })
})
