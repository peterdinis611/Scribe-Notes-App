import { invalidateDocumentCache, peekCachedDocument } from '@/lib/cache/document-cache'
import { deleteDocument, type DocumentSummary } from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import type { AppDispatch } from '@/store/index'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSecondaryDocumentId,
  updateDocuments,
} from '@/store/documentsSlice'

type NavigateFn = (route: ReturnType<typeof ROUTES.home> | ReturnType<typeof ROUTES.document>) => void | Promise<void>

/** True when the id is still present in the open (non-trashed) library list. */
export function isOpenLibraryDocumentId(
  documents: DocumentSummary[],
  id: string | null | undefined,
): boolean {
  if (!id) return false
  return documents.some((doc) => doc.id === id && doc.deletedAt == null)
}

/**
 * Optimistically remove documents from the library UI and retarget the active editor.
 * Prefer the next open tab when trashing the active document.
 */
export function removeDocumentsFromLibraryUi(args: {
  ids: string[]
  documents: DocumentSummary[]
  activeId: string | null
  openDocumentIds: string[]
  secondaryDocumentId?: string | null
  dispatch: AppDispatch
  navigate: NavigateFn
}): DocumentSummary[] {
  const idSet = new Set(args.ids)
  const removed = args.documents.filter((doc) => idSet.has(doc.id))
  if (removed.length === 0) return []

  args.dispatch(updateDocuments((prev) => prev.filter((doc) => !idSet.has(doc.id))))

  if (args.secondaryDocumentId && idSet.has(args.secondaryDocumentId)) {
    args.dispatch(setSecondaryDocumentId(null))
  }

  if (!args.activeId || !idSet.has(args.activeId)) {
    return removed
  }

  const nextFromTabs =
    args.openDocumentIds.find((id) => id !== args.activeId && !idSet.has(id)) ?? null
  const nextId =
    nextFromTabs ??
    args.documents.find((doc) => !idSet.has(doc.id) && doc.deletedAt == null)?.id ??
    null

  args.dispatch(setActiveDocumentId(nextId))
  if (!nextId) {
    args.dispatch(setActiveDocument(null))
    void args.navigate(ROUTES.home())
  } else {
    const cached = peekCachedDocument(nextId)
    if (cached) args.dispatch(setActiveDocument(cached))
    void args.navigate(ROUTES.document(nextId))
  }

  return removed
}

export async function trashDocuments(args: {
  ids: string[]
  documents: DocumentSummary[]
  activeId: string | null
  openDocumentIds: string[]
  secondaryDocumentId?: string | null
  dispatch: AppDispatch
  navigate: NavigateFn
}): Promise<DocumentSummary[]> {
  const removed = removeDocumentsFromLibraryUi(args)
  if (removed.length === 0) return []

  try {
    for (const doc of removed) {
      await deleteDocument(doc.id)
      invalidateDocumentCache(doc.id)
    }
    return removed
  } catch (error) {
    args.dispatch(updateDocuments((prev) => [...prev, ...removed]))
    const restoredActive = removed.find((doc) => doc.id === args.activeId)
    if (restoredActive) {
      args.dispatch(setActiveDocumentId(restoredActive.id))
      const cached = peekCachedDocument(restoredActive.id)
      if (cached) args.dispatch(setActiveDocument(cached))
      void args.navigate(ROUTES.document(restoredActive.id))
    }
    throw error
  }
}
