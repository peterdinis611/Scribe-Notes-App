import { nlpRewriteQuery as rewriteQuery } from '@/lib/db/nlp-api'

/**
 * Expand SK/EN synonyms for search (Python sidecar preferred, Rust fallback).
 * Returns the original query when rewrite is unavailable or empty.
 */
export async function expandSearchQuery(
  query: string,
  maxExpansions = 6,
): Promise<{ query: string; rewritten: string; expansions: string[]; source: string }> {
  const trimmed = query.trim()
  if (!trimmed) {
    return { query: '', rewritten: '', expansions: [], source: 'none' }
  }
  try {
    const result = await rewriteQuery({ query: trimmed, maxExpansions })
    const rewritten = (result.rewritten || trimmed).trim() || trimmed
    return {
      query: result.query || trimmed,
      rewritten,
      expansions: result.expansions ?? [],
      source: result.source || 'unknown',
    }
  } catch {
    return { query: trimmed, rewritten: trimmed, expansions: [], source: 'none' }
  }
}

/** Prefer rewritten text for hybrid/semantic retrieval. */
export async function searchNeedle(query: string): Promise<string> {
  const { rewritten } = await expandSearchQuery(query)
  return rewritten || query.trim()
}
