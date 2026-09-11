import { setDocumentTags, type DocumentSummary, type Folder } from '@/lib/db/api'
import { nlpStatus, nlpSuggestTags } from '@/lib/db/nlp-api'
import { describeNlpTagSuggestionFailure } from '@/lib/nlp/errors'
import type { AppDispatch } from '@/store/index'
import { updateDocuments } from '@/store/documentsSlice'

function normalizeTag(value: string): string {
  return value.trim().toLowerCase()
}

/** Merge AI tag suggestions into the document; returns newly added tags. */
export async function applySuggestedTagsToDocument(
  document: DocumentSummary,
  dispatch: AppDispatch,
): Promise<{ added: string[]; folderSuggestion: string | null }> {
  const status = await nlpStatus()
  if (!status.enabled || !status.sidecarOk) {
    const hint = describeNlpTagSuggestionFailure(status, null)
    throw new Error(hint)
  }

  const suggestions = await nlpSuggestTags(document.id)
  const existing = new Set(document.tags.map(normalizeTag))
  const added = suggestions.tagSuggestions
    .map((tag) => tag.trim())
    .filter((tag) => tag && !existing.has(normalizeTag(tag)))

  if (added.length > 0) {
    const tags = Array.from(new Set([...document.tags, ...added])).sort((a, b) =>
      a.localeCompare(b),
    )
    dispatch(
      updateDocuments((prev) =>
        prev.map((doc) => (doc.id === document.id ? { ...doc, tags } : doc)),
      ),
    )
    await setDocumentTags(document.id, tags)
  }

  return {
    added,
    folderSuggestion: null,
  }
}

export async function applySuggestedTagsAndFolderHint(
  document: DocumentSummary,
  folders: Folder[],
  dispatch: AppDispatch,
): Promise<{ added: string[]; folderSuggestion: string | null }> {
  const result = await applySuggestedTagsToDocument(document, dispatch)
  const terms = [...document.tags, ...result.added]
  const folder = suggestFolderFromTags(folders, terms)
  return {
    ...result,
    folderSuggestion: folder && folder.id !== document.folderId ? folder.name : null,
  }
}

/** Suggest a folder by matching suggestion/tag terms to folder names. */
export function suggestFolderFromTags(
  folders: Folder[],
  terms: string[],
): Folder | null {
  const needles = terms.map(normalizeTag).filter(Boolean)
  if (needles.length === 0) return null

  let best: { folder: Folder; score: number } | null = null
  for (const folder of folders) {
    const name = normalizeTag(folder.name)
    if (!name) continue
    let score = 0
    for (const needle of needles) {
      if (name === needle) score += 3
      else if (name.includes(needle) || needle.includes(name)) score += 1
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { folder, score }
    }
  }
  return best?.folder ?? null
}
