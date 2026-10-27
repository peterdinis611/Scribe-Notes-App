import type { DocumentSummary } from '@/lib/db/api'

/**
 * Aliases live as tags: `alias:short-name` (multiple allowed).
 * Sync mirror of `scribe_core::wiki::aliases` (hot path / vitest without Tauri).
 */

const ALIAS_PREFIX = /^alias:/i

export function parseAliases(tags: string[] | null | undefined): string[] {
  const out: string[] = []
  for (const raw of tags ?? []) {
    const tag = raw.trim()
    if (!ALIAS_PREFIX.test(tag)) continue
    const value = tag.replace(ALIAS_PREFIX, '').trim()
    if (value) out.push(value)
  }
  return out
}

export function addAliasTag(tags: string[] | null | undefined, alias: string): string[] {
  const value = alias.trim()
  if (!value) return [...(tags ?? [])]
  const next = [...(tags ?? [])]
  const needle = `alias:${value}`
  if (next.some((tag) => tag.toLowerCase() === needle.toLowerCase())) return next
  next.push(needle)
  return next
}

export function documentMatchesTitleOrAlias(
  doc: Pick<DocumentSummary, 'title' | 'tags'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  if (doc.title.trim().toLowerCase() === q) return true
  return parseAliases(doc.tags).some((alias) => alias.toLowerCase() === q)
}

export function findDocumentByTitleOrAlias(
  documents: DocumentSummary[],
  query: string,
  excludeId?: string | null,
): DocumentSummary | null {
  const live = documents.filter((doc) => !doc.deletedAt && doc.id !== excludeId)
  return live.find((doc) => documentMatchesTitleOrAlias(doc, query)) ?? null
}
