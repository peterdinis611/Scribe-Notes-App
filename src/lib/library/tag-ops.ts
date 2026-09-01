import { setDocumentTags } from '@/lib/db/api'
import type { DocumentSummary } from '@/lib/db/api'

/** Rename a tag on every document that uses it. */
export async function renameTagAcrossLibrary(
  documents: DocumentSummary[],
  from: string,
  to: string,
): Promise<number> {
  const trimmed = to.trim()
  if (!from || !trimmed || from === trimmed) return 0

  let count = 0
  for (const doc of documents) {
    if (doc.deletedAt != null || !doc.tags.includes(from)) continue
    const next = [...new Set(doc.tags.map((tag) => (tag === from ? trimmed : tag)))]
    await setDocumentTags(doc.id, next)
    count += 1
  }
  return count
}

/** Merge multiple tags into one target tag. */
export async function mergeTagsAcrossLibrary(
  documents: DocumentSummary[],
  sources: string[],
  target: string,
): Promise<number> {
  const trimmed = target.trim()
  if (!trimmed || sources.length === 0) return 0

  const sourceSet = new Set(sources.filter((tag) => tag !== trimmed))
  if (sourceSet.size === 0) return 0

  let count = 0
  for (const doc of documents) {
    if (doc.deletedAt != null) continue
    if (!doc.tags.some((tag) => sourceSet.has(tag))) continue
    const next = [...new Set(doc.tags.filter((tag) => !sourceSet.has(tag)).concat(trimmed))]
    await setDocumentTags(doc.id, next)
    count += 1
  }
  return count
}
