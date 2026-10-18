import { type DocumentSummary } from '@/lib/db/api'

/** Keep in sync with `scribe_ui::smart_filter_ids` where applicable. */
export type LibrarySmartFilter =
  | 'none'
  | 'unlinked'
  | 'untagged'
  | 'unread'
  | 'canvas'
  | 'stubs'
  | 'tasks'
  | 'media'

export const LIBRARY_SMART_FILTER_IDS = [
  'none',
  'unlinked',
  'untagged',
  'unread',
  'canvas',
  'stubs',
  'tasks',
  'media',
] as const satisfies readonly LibrarySmartFilter[]

export type SmartFilterOptions = {
  orphanIds?: Set<string>
  recentDocumentIds?: string[]
  canvasIds?: Set<string>
  stubIds?: Set<string>
  taskDocIds?: Set<string>
  mediaDocIds?: Set<string>
}

export function documentMatchesSmartFilter(
  doc: DocumentSummary,
  filter: LibrarySmartFilter,
  options: SmartFilterOptions = {},
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
    case 'canvas':
      return options.canvasIds?.has(doc.id) ?? false
    case 'stubs':
      return options.stubIds?.has(doc.id) ?? false
    case 'tasks':
      return options.taskDocIds?.has(doc.id) ?? false
    case 'media':
      return options.mediaDocIds?.has(doc.id) ?? false
    default:
      return true
  }
}

