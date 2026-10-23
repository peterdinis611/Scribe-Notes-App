import Fuse from 'fuse.js'
import { fuzzyRankStringsNative, type FuzzyRankItem } from '@/lib/db/api'
import { isTauriRuntime } from '@/lib/tauri'

export type FuzzyListOptions = {
  /** Fuse threshold — 0.0 exact, 1.0 match anything. Default 0.34. */
  threshold?: number
  limit?: number
}

/** Strip combining marks: "Správa" → "Sprava". */
export function foldDiacritics(input: string): string {
  return input.normalize('NFKD').replace(/\p{M}/gu, '')
}

/** Casefold + diacritic fold + punct→space (aligned with scribe-core / python-ui). */
export function normalizeForFuzzy(input: string): string {
  return foldDiacritics(input)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function tokenBoundaryBonus(haystack: string, index: number): number {
  return index === 0 || !/[\p{L}\p{N}]/u.test(haystack[index - 1] ?? '') ? 6 : 0
}

/** Subsequence score for one normalized token (0..60), favors runs and word starts. */
function subsequenceScore(haystack: string, needle: string): number {
  let pos = -1
  let prev = -2
  let bonus = 0
  let gapPenalty = 0
  for (const ch of needle) {
    pos = haystack.indexOf(ch, pos + 1)
    if (pos < 0) return 0
    if (pos === prev + 1) bonus += 4
    else if (prev >= 0) gapPenalty += (pos - prev - 1) * 0.5
    bonus += tokenBoundaryBonus(haystack, pos)
    prev = pos
  }
  return Math.max(1, Math.min(60, 30 + bonus - gapPenalty))
}

/** Score one normalized token against a normalized haystack (0..100). */
export function tokenScore(haystack: string, needle: string): number {
  if (!haystack || !needle) return 0
  if (haystack === needle) return 100
  if (haystack.startsWith(needle)) return 95 - Math.min(haystack.length - needle.length, 20) * 0.25
  const idx = haystack.indexOf(needle)
  if (idx >= 0) {
    const base = tokenBoundaryBonus(haystack, idx) > 0 ? 90 : 75
    return base - Math.min(idx, 30) * 0.5
  }
  return subsequenceScore(haystack, needle)
}

/**
 * Fast structural score before Fuse: all query tokens must match (AND).
 * Returns 0..100, or 0 if any token fails.
 */
export function structuralScore(haystackRaw: string, queryNormalized: string): number {
  const haystack = normalizeForFuzzy(haystackRaw)
  if (!haystack || !queryNormalized) return 0
  const tokens = queryNormalized.split(' ').filter(Boolean)
  if (tokens.length === 0) return 0
  let total = 0
  for (const token of tokens) {
    const score = tokenScore(haystack, token)
    if (score <= 0) return 0
    total += score
  }
  return total / tokens.length
}

type Prepared<T> = {
  item: T
  index: number
  primary: string
  secondary: string
  primaryFolded: string
  secondaryFolded: string
}

/**
 * Rank / filter a list. Empty query returns the original list (caller can slice).
 * Uses diacritic-aware structural scoring, then Fuse.js as a soft fallback.
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

  const qNorm = normalizeForFuzzy(q)
  if (!qNorm) return [...items]

  const prepared: Prepared<T>[] = items.map((item, index) => {
    const hay = getHaystack(item)
    const fields = Array.isArray(hay) ? hay : [hay]
    const primary = fields[0] ?? ''
    const secondary = fields.slice(1).join(' ')
    return {
      item,
      index,
      primary,
      secondary,
      primaryFolded: normalizeForFuzzy(primary),
      secondaryFolded: normalizeForFuzzy(secondary),
    }
  })

  type Scored = { item: T; index: number; score: number }
  const structural: Scored[] = []
  const softCandidates: Prepared<T>[] = []

  for (const row of prepared) {
    const primaryScore = structuralScore(row.primary, qNorm)
    const secondaryScore = row.secondary
      ? structuralScore(row.secondary, qNorm) * 0.65
      : 0
    const best = Math.max(primaryScore, secondaryScore)
    if (best >= 55) {
      // Prefer primary matches slightly when scores are close.
      const boosted = best + (primaryScore >= secondaryScore ? 2 : 0)
      structural.push({ item: row.item, index: row.index, score: boosted })
    } else {
      softCandidates.push(row)
    }
  }

  structural.sort((a, b) => b.score - a.score || a.index - b.index)

  const limit = options.limit ?? items.length
  if (structural.length >= limit) {
    return structural.slice(0, limit).map((row) => row.item)
  }

  const seen = new Set(structural.map((row) => row.index))
  const out = structural.map((row) => row.item)

  if (softCandidates.length === 0 || out.length >= limit) {
    return out.slice(0, limit)
  }

  const fuse = new Fuse(softCandidates, {
    keys: [
      { name: 'primaryFolded', weight: 0.75 },
      { name: 'secondaryFolded', weight: 0.25 },
    ],
    threshold: options.threshold ?? 0.34,
    ignoreLocation: true,
    includeScore: true,
    // Prefer matches near the start of titles for short queries.
    distance: Math.max(80, qNorm.length * 12),
    minMatchCharLength: Math.min(Math.max(qNorm.length, 1), 2),
  })

  for (const hit of fuse.search(qNorm)) {
    if (seen.has(hit.item.index)) continue
    out.push(hit.item.item)
    seen.add(hit.item.index)
    if (out.length >= limit) break
  }

  return out
}

/**
 * Prefer Rust `scribe-ui` fuzzy ranking under Tauri; falls back to improved fuse path.
 */
export async function fuzzyFilterNative<T>(
  items: readonly T[],
  query: string,
  getHaystack: (item: T) => string | string[],
  options: FuzzyListOptions = {},
): Promise<T[]> {
  const q = query.trim()
  if (!q) return [...items]
  if (items.length === 0) return []

  if (isTauriRuntime()) {
    try {
      const payload: FuzzyRankItem[] = items.map((item, index) => {
        const hay = getHaystack(item)
        const fields = Array.isArray(hay) ? hay : [hay]
        return {
          id: String(index),
          primary: fields[0] ?? '',
          secondary: fields.slice(1).join(' '),
        }
      })
      const hits = await fuzzyRankStringsNative(payload, q, options.limit ?? null)
      if (hits.length > 0) {
        return hits
          .map((hit) => items[Number(hit.id)])
          .filter((item): item is T => item !== undefined)
      }
    } catch {
      // Fall through.
    }
  }

  return fuzzyFilter(items, query, getHaystack, options)
}

export type FuzzyTextChunk = {
  text: string
  from: number
}

export type FuzzyTextMatch = {
  from: number
  to: number
}

type FoldedChunk = {
  folded: string
  /** folded index → original char index within the chunk text */
  map: number[]
  from: number
  text: string
}

function foldChunk(text: string, from: number, lowercase: boolean): FoldedChunk {
  const map: number[] = []
  let folded = ''
  let originalIndex = 0
  for (const char of text) {
    const piece = char.normalize('NFKD')
    for (const unit of piece) {
      if (/\p{M}/u.test(unit)) continue
      folded += lowercase ? unit.toLowerCase() : unit
      map.push(originalIndex)
    }
    originalIndex += char.length
  }
  return { folded, map, from, text }
}

/**
 * Fuzzy-match a query against ProseMirror text chunks and return document ranges.
 * Diacritic-insensitive; Fuse match indices are mapped back to original offsets.
 */
export function findFuzzyTextMatches(
  chunks: readonly FuzzyTextChunk[],
  term: string,
  options: { caseSensitive?: boolean; threshold?: number } = {},
): FuzzyTextMatch[] {
  const q = term.trim()
  if (!q || chunks.length === 0) return []

  const caseSensitive = options.caseSensitive ?? false
  const qFolded = caseSensitive ? foldDiacritics(q) : normalizeForFuzzy(q)
  if (!qFolded) return []

  const foldedChunks = chunks.map((chunk) => foldChunk(chunk.text, chunk.from, !caseSensitive))

  const fuse = new Fuse(foldedChunks, {
    keys: ['folded'],
    includeMatches: true,
    threshold: options.threshold ?? 0.38,
    ignoreLocation: true,
    isCaseSensitive: caseSensitive,
    minMatchCharLength: Math.min(Math.max(qFolded.length, 1), 2),
    findAllMatches: true,
  })

  const matches: FuzzyTextMatch[] = []
  for (const result of fuse.search(qFolded)) {
    const indices = result.matches?.flatMap((match) => match.indices) ?? []
    if (indices.length === 0) {
      matches.push({
        from: result.item.from,
        to: result.item.from + result.item.text.length,
      })
      continue
    }
    for (const [start, end] of indices) {
      if (end < start) continue
      const map = result.item.map
      const origStart = map[start] ?? 0
      const lastFolded = Math.min(end, map.length - 1)
      const lastOrig = map[lastFolded] ?? origStart
      const lastChar = [...result.item.text.slice(lastOrig)][0] ?? ''
      matches.push({
        from: result.item.from + origStart,
        to: result.item.from + lastOrig + lastChar.length,
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
