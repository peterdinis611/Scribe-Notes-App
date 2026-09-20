export type WikiGhostCandidate = {
  id: string
  title: string
  phrase: string
}

export type WikiGhostMatch = {
  id: string
  title: string
  phrase: string
  start: number
  end: number
}

/** Longest title/phrase that already appears as plain text in the paragraph. */
export function findWikiGhostMatch(
  paragraph: string,
  candidates: WikiGhostCandidate[],
  minLength = 4,
): WikiGhostMatch | null {
  const hay = paragraph.toLowerCase()
  let best: WikiGhostMatch | null = null

  for (const item of candidates) {
    const phrase = (item.phrase || item.title).trim()
    if (phrase.length < minLength) continue
    const idx = hay.lastIndexOf(phrase.toLowerCase())
    if (idx < 0) continue
    const beforeToken = paragraph.slice(Math.max(0, idx - 2), idx)
    if (beforeToken === '[[') continue
    const before = idx > 0 ? paragraph[idx - 1] : ''
    const after = paragraph[idx + phrase.length] ?? ''
    if (before && /[\p{L}\p{N}_]/u.test(before)) continue
    if (after && /[\p{L}\p{N}_]/u.test(after)) continue
    if (!best || phrase.length > best.phrase.length) {
      best = {
        id: item.id,
        title: item.title,
        phrase,
        start: idx,
        end: idx + phrase.length,
      }
    }
  }

  return best
}
