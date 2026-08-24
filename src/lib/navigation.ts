import { peekCachedDocument } from '@/lib/cache/document-cache'
import { ROUTES } from '@/lib/routes'
import type { AppDispatch } from '@/store/index'
import {
  closeOpenDocument,
  setActiveDocument,
  setActiveDocumentId,
} from '@/store/documentsSlice'

type NavigateFn = (route: ReturnType<typeof ROUTES.home> | ReturnType<typeof ROUTES.document>) => void | Promise<void>

/** Close the active document tab and show the welcome screen when no tabs remain. */
export function closeActiveDocumentAndMaybeHome(args: {
  activeId: string | null
  openDocumentIds: string[]
  dispatch: AppDispatch
  navigate: NavigateFn
}) {
  const { activeId, openDocumentIds, dispatch, navigate } = args
  if (!activeId) {
    dispatch(setActiveDocumentId(null))
    dispatch(setActiveDocument(null))
    void navigate(ROUTES.home())
    return
  }

  const index = openDocumentIds.indexOf(activeId)
  const remaining = openDocumentIds.filter((id) => id !== activeId)
  const nextId = remaining[index] ?? remaining[index - 1] ?? null
  dispatch(closeOpenDocument(activeId))

  if (nextId) {
    const cached = peekCachedDocument(nextId)
    if (cached) dispatch(setActiveDocument(cached))
    void navigate(ROUTES.document(nextId))
    return
  }

  // Explicitly clear — closeOpenDocument already nulls activeId, but setActiveDocument
  // + home navigation must win over any in-flight /doc/$id route sync.
  dispatch(setActiveDocumentId(null))
  dispatch(setActiveDocument(null))
  void navigate(ROUTES.home())
}

/** Clear the active document and open the welcome (home) screen. Open tabs stay available. */
export function goToHome(args: { dispatch: AppDispatch; navigate: NavigateFn }) {
  args.dispatch(setActiveDocumentId(null))
  args.dispatch(setActiveDocument(null))
  void args.navigate(ROUTES.home())
}
