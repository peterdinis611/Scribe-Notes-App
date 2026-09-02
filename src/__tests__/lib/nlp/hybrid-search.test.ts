import { describe, expect, it } from 'vitest'
import { fuseSearchHits } from '@/lib/nlp/hybrid-search'
import type { SearchHit } from '@/lib/db/api'

function hit(id: string, title: string, rank: number): SearchHit {
  return { documentId: id, title, snippet: '', rank }
}

describe('fuseSearchHits', () => {
  it('prefers documents present in both lists', () => {
    const fts = [hit('a', 'Alpha', 0.1), hit('b', 'Beta', 0.2)]
    const semantic = [hit('b', 'Beta', 0.05), hit('c', 'Gamma', 0.08)]
    const fused = fuseSearchHits(fts, semantic, 3)
    expect(fused.map((item) => item.documentId)).toEqual(['b', 'a', 'c'])
  })

  it('returns semantic-only results when fts is empty', () => {
    const semantic = [hit('x', 'X', 0.1)]
    const fused = fuseSearchHits([], semantic, 5)
    expect(fused).toHaveLength(1)
    expect(fused[0]?.documentId).toBe('x')
  })

  it('respects limit', () => {
    const fts = [hit('1', 'One', 0), hit('2', 'Two', 0), hit('3', 'Three', 0)]
    const fused = fuseSearchHits(fts, [], 2)
    expect(fused).toHaveLength(2)
  })
})
