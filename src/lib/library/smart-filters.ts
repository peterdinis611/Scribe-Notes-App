import {
  documentMatchesSmartFilterNative,
  filterDocumentsBySmartFilterNative,
  type DocumentSummary,
} from '@/lib/db/api'
import { isTauriRuntime } from '@/lib/tauri'

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

function toNativeDoc(doc: Pick<DocumentSummary, 'id' | 'tags' | 'deletedAt'>) {
  return {
    id: doc.id,
    tags: doc.tags,
    deletedAt: doc.deletedAt ?? null,
  }
}

function toNativeOptions(options: SmartFilterOptions) {
  return {
    orphanIds: options.orphanIds ? [...options.orphanIds] : [],
    recentDocumentIds: options.recentDocumentIds ?? [],
    canvasIds: options.canvasIds ? [...options.canvasIds] : [],
    stubIds: options.stubIds ? [...options.stubIds] : [],
    taskDocIds: options.taskDocIds ? [...options.taskDocIds] : [],
    mediaDocIds: options.mediaDocIds ? [...options.mediaDocIds] : [],
  }
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

/** Prefer Rust `scribe-ui` under Tauri; otherwise JS fallback. */
export async function documentMatchesSmartFilterAsync(
  doc: DocumentSummary,
  filter: LibrarySmartFilter,
  options: SmartFilterOptions,
): Promise<boolean> {
  if (isTauriRuntime()) {
    try {
      return await documentMatchesSmartFilterNative({
        doc: toNativeDoc(doc),
        filter,
        options: toNativeOptions(options),
      })
    } catch {
      /* fall through */
    }
  }
  return documentMatchesSmartFilter(doc, filter, options)
}

/** Prefer Rust batch filter under Tauri; otherwise JS fallback. */
export async function filterDocumentsBySmartFilterAsync(
  docs: DocumentSummary[],
  filter: LibrarySmartFilter,
  options: SmartFilterOptions,
): Promise<DocumentSummary[]> {
  if (filter === 'none') return docs
  if (isTauriRuntime()) {
    try {
      const matched = await filterDocumentsBySmartFilterNative({
        docs: docs.map(toNativeDoc),
        filter,
        options: toNativeOptions(options),
      })
      const ids = new Set(matched.map((row) => row.id))
      return docs.filter((doc) => ids.has(doc.id))
    } catch {
      /* fall through */
    }
  }
  return docs.filter((doc) => documentMatchesSmartFilter(doc, filter, options))
}
