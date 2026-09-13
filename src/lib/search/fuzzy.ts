import Fuse from 'fuse.js'

export type FuzzyListOptions = {
  /** Fuse threshold — 0.0 exact, 1.0 match anything. Default 0.35. */
  threshold?: number
  limit?: number
}

/**
 * Rank / filter a list with fuse.js. Returns items in best-match order.
 * Empty query returns the original list (caller can slice).
 */
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  getHaystack: (item: T) => string | string[],
  options: FuzzyListOptions = {},
): T[] {
  const q = query.trim()
  if (!q) return [...items]
  if (items.length === 0) return []

  const prepared = items.map((item, index) => {
    const hay = getHaystack(item)
    const fields = Array.isArray(hay) ? hay : [hay]
    return {
      index,
      primary: fields[0] ?? '',
      secondary: fields.slice(1).join(' '),
    }
  })

  const fuse = new Fuse(prepared, {
    keys: [
      { name: 'primary', weight: 0.75 },
      { name: 'secondary', weight: 0.25 },
    ],
    threshold: options.threshold ?? 0.35,
    ignoreLocation: true,
    includeScore: true,
  })

  const hits = fuse.search(q)
  const limit = options.limit ?? hits.length
  return hits.slice(0, limit).map((hit) => items[hit.item.index]!)
}

export type FuzzyTextChunk = {
  text: string
  from: number
}

export type FuzzyTextMatch = {
  from: number
  to: number
}

/**
 * Fuzzy-match a query against ProseMirror text chunks and return document ranges.
 * Fuse match indices are inclusive on both ends.
 */
export function findFuzzyTextMatches(
  chunks: readonly FuzzyTextChunk[],
  term: string,
  options: { caseSensitive?: boolean; threshold?: number } = {},
): FuzzyTextMatch[] {
  const q = term.trim()
  if (!q || chunks.length === 0) return []

  const fuse = new Fuse([...chunks], {
    keys: ['text'],
    includeMatches: true,
    threshold: options.threshold ?? 0.4,
    ignoreLocation: true,
    isCaseSensitive: options.caseSensitive ?? false,
    minMatchCharLength: Math.min(Math.max(q.length, 1), 2),
    findAllMatches: true,
  })

  const matches: FuzzyTextMatch[] = []
  for (const result of fuse.search(q)) {
    const indices = result.matches?.flatMap((match) => match.indices) ?? []
    if (indices.length === 0) {
      // Fallback: highlight whole chunk when Fuse scores without indices.
      matches.push({
        from: result.item.from,
        to: result.item.from + result.item.text.length,
      })
      continue
    }
    for (const [start, end] of indices) {
      if (end < start) continue
      matches.push({
        from: result.item.from + start,
        to: result.item.from + end + 1,
      })
    }
  }

  matches.sort((a, b) => a.from - b.from || a.to - b.to)
  return dedupeOverlapping(matches)
}

function dedupeOverlapping(matches: FuzzyTextMatch[]): FuzzyTextMatch[] {
  if (matches.length <= 1) return matches
  const out: FuzzyTextMatch[] = []
  for (const match of matches) {
    const prev = out[out.length - 1]
    if (prev && match.from <= prev.to) {
      prev.to = Math.max(prev.to, match.to)
      continue
    }
    out.push({ ...match })
  }
  return out
}
