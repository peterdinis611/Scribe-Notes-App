import type { DocumentSummary } from '@/lib/db/api'

/** Keep in sync with `scribe_ui::smart_filter_ids`. */
export type LibrarySmartFilter = 'none' | 'unlinked' | 'untagged' | 'unread'

export const LIBRARY_SMART_FILTER_IDS = [
  'none',
  'unlinked',
  'untagged',
  'unread',
] as const satisfies readonly LibrarySmartFilter[]

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
