import type { DocumentSummary } from '@/lib/db/api'

export type LibrarySmartFilter = 'none' | 'unlinked' | 'untagged' | 'unread'

export function documentMatchesSmartFilter(
  doc: DocumentSummary,
  filter: LibrarySmartFilter,
  options: {
    orphanIds?: Set<string>
    recentDocumentIds?: string[]
  },
): boolean {
  if (filter === 'none') return true
  if (doc.deletedAt != null) return false

  switch (filter) {
    case 'untagged':
      return doc.tags.length === 0
    case 'unlinked':
      return options.orphanIds?.has(doc.id) ?? false
    case 'unread': {
      const recent = new Set(options.recentDocumentIds ?? [])
      return !recent.has(doc.id)
    }
    default:
      return true
  }
}
