import type { LinkGraphOrphan, SearchHit } from '@/lib/db/api'

/** Untitled detection mirrored in `scribe_ui::graph`. */

const UNTITLED_RE = /^(untitled|bez názvu|bez nazvu)$/i

export function isUntitledOrphanTitle(title: string | null | undefined): boolean {
  const trimmed = (title || '').trim()
  return !trimmed || UNTITLED_RE.test(trimmed)
}

export function partitionOrphans(orphans: LinkGraphOrphan[]): {
  untitled: LinkGraphOrphan[]
  named: LinkGraphOrphan[]
} {
  const untitled: LinkGraphOrphan[] = []
  const named: LinkGraphOrphan[] = []
  for (const orphan of orphans) {
    if (isUntitledOrphanTitle(orphan.title)) untitled.push(orphan)
    else named.push(orphan)
  }
  return { untitled, named }
}

export type OrphanLinkSuggestion = {
  orphanId: string
  orphanTitle: string
  targetId: string
  targetTitle: string
  rank?: number
}

/** Pick the best similar non-orphan target for each orphan row. */
export function suggestOrphanLinks(
  rows: Array<{ id: string; title: string; similar: SearchHit[] }>,
): OrphanLinkSuggestion[] {
  const out: OrphanLinkSuggestion[] = []
  for (const row of rows) {
    const hit = row.similar.find((item) => item.documentId && item.documentId !== row.id)
    if (!hit?.documentId) continue
    out.push({
      orphanId: row.id,
      orphanTitle: row.title,
      targetId: hit.documentId,
      targetTitle: hit.title || 'Note',
      rank: hit.rank,
    })
  }
  return out
}
