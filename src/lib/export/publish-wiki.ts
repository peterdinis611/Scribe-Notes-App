import type { DocumentSummary } from '@/lib/db/api'
import { invoke } from '@/lib/tauri'

/** Export selected (or all) notes as a static HTML wiki via Rust. */
export async function publishLocalWikiSite(args: {
  documents: DocumentSummary[]
  siteTitle?: string
  dialogTitle?: string
}): Promise<string | null> {
  const live = args.documents.filter((doc) => !doc.deletedAt).slice(0, 200)
  if (live.length === 0) return null

  return invoke<string | null>('publish_wiki_site', {
    input: {
      documentIds: live.map((doc) => doc.id),
      siteTitle: args.siteTitle ?? null,
    },
  })
}
