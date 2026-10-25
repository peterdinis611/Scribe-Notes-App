import { listOutgoingLinks } from '@/lib/db/api'
import { invoke } from '@/lib/tauri'

/** Collect note + up to `hops` outbound wiki-link neighbors (BFS). */
export async function collectWikiNeighborhood(
  rootId: string,
  hops = 2,
  maxNotes = 80,
): Promise<string[]> {
  const seen = new Set<string>([rootId])
  let frontier = [rootId]
  for (let depth = 0; depth < hops && frontier.length > 0; depth += 1) {
    const next: string[] = []
    for (const id of frontier) {
      const outbound = await listOutgoingLinks(id).catch(() => [])
      for (const doc of outbound) {
        if (seen.has(doc.id) || seen.size >= maxNotes) continue
        seen.add(doc.id)
        next.push(doc.id)
      }
      if (seen.size >= maxNotes) break
    }
    frontier = next
  }
  return [...seen]
}

/** Export a note subgraph via Rust (TipTap blobs stay in SQLite). */
export async function exportWikiPack(args: {
  rootId: string
  rootTitle?: string
  hops?: number
  dialogTitle?: string
}): Promise<string | null> {
  const hops = args.hops ?? 2
  const ids = await collectWikiNeighborhood(args.rootId, hops)
  if (ids.length === 0) return null

  return invoke<string | null>('export_wiki_pack', {
    input: {
      documentIds: ids,
      rootId: args.rootId,
      rootTitle: args.rootTitle ?? null,
      hops,
    },
  })
}
