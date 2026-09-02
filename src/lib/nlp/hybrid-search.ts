import type { SearchHit } from '@/lib/db/api'

const RRF_K = 60

function rrfScore(rank: number) {
  return 1 / (RRF_K + rank + 1)
}

/** Merge FTS and semantic hits with Reciprocal Rank Fusion. */
export function fuseSearchHits(
  ftsHits: SearchHit[],
  semanticHits: SearchHit[],
  limit = 12,
): SearchHit[] {
  const merged = new Map<
    string,
    { hit: SearchHit; score: number; semantic: boolean; fts: boolean }
  >()

  ftsHits.forEach((hit, rank) => {
    merged.set(hit.documentId, {
      hit,
      score: rrfScore(rank),
      semantic: false,
      fts: true,
    })
  })

  semanticHits.forEach((hit, rank) => {
    const existing = merged.get(hit.documentId)
    if (existing) {
      existing.score += rrfScore(rank)
      existing.semantic = true
      if (!existing.hit.snippet && hit.snippet) {
        existing.hit = { ...existing.hit, snippet: hit.snippet }
      }
    } else {
      merged.set(hit.documentId, {
        hit,
        score: rrfScore(rank),
        semantic: true,
        fts: false,
      })
    }
  })

  return [...merged.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ hit, score }) => ({
      ...hit,
      rank: -score,
    }))
}

export function isHybridSearchScope(scope: string) {
  return scope === 'all' || scope === 'content'
}
