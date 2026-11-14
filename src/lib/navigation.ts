import { peekCachedDocument } from '@/lib/cache/document-cache'
import { prefetchDocument } from '@/lib/cache/prefetch-document'
import { ROUTES } from '@/lib/routes'
import type { AppDispatch } from '@/store/index'
import {
  clearDocumentNav,
  closeAllOpenDocuments,
  closeOpenDocument,
  closeOtherOpenDocuments,
  popDocumentNav,
  pushDocumentNav,
  setActiveDocument,
  setActiveDocumentId,
  trimDocumentNavTo,
} from '@/store/documentsSlice'

type NavigateFn = (route: ReturnType<typeof ROUTES.home> | ReturnType<typeof ROUTES.document>) => void | Promise<void>

/** Close the active document tab and show the welcome screen when no tabs remain. */
export function closeActiveDocumentAndMaybeHome(args: {
  activeId: string | null
  openDocumentIds: string[]
  pinnedDocumentIds?: string[]
  dispatch: AppDispatch
  navigate: NavigateFn
}) {
  const { activeId, openDocumentIds, dispatch, navigate } = args
  const pinned = new Set(args.pinnedDocumentIds ?? [])

  if (!activeId) {
    dispatch(setActiveDocumentId(null))
    dispatch(setActiveDocument(null))
    dispatch(clearDocumentNav())
    void navigate(ROUTES.home())
    return
  }

  if (pinned.has(activeId)) {
    return
  }

  const index = openDocumentIds.indexOf(activeId)
  const remaining = openDocumentIds.filter((id) => id !== activeId)
  const nextId = remaining[index] ?? remaining[index - 1] ?? null
  dispatch(closeOpenDocument(activeId))

  if (nextId) {
    const cached = peekCachedDocument(nextId)
    if (cached) dispatch(setActiveDocument(cached))
    else prefetchDocument(nextId)
    void navigate(ROUTES.document(nextId))
    return
  }

  dispatch(setActiveDocumentId(null))
  dispatch(setActiveDocument(null))
  dispatch(clearDocumentNav())
  void navigate(ROUTES.home())
}

/** Clear the active document and open the welcome (home) screen. Open tabs stay available. */
export function goToHome(args: { dispatch: AppDispatch; navigate: NavigateFn }) {
  args.dispatch(setActiveDocumentId(null))
  args.dispatch(setActiveDocument(null))
  args.dispatch(clearDocumentNav())
  void args.navigate(ROUTES.home())
}

/** Close all unpinned tabs; navigate to a remaining pin or home. */
export function closeAllTabsAndMaybeHome(args: {
  dispatch: AppDispatch
  navigate: NavigateFn
  pinnedDocumentIds: string[]
  activeDocumentId: string | null
}) {
  const pinned = args.pinnedDocumentIds
  const nextId =
    args.activeDocumentId && pinned.includes(args.activeDocumentId)
      ? args.activeDocumentId
      : (pinned[0] ?? null)
  args.dispatch(closeAllOpenDocuments())
  if (nextId) {
    const cached = peekCachedDocument(nextId)
    if (cached) args.dispatch(setActiveDocument(cached))
    else prefetchDocument(nextId)
    void args.navigate(ROUTES.document(nextId))
    return
  }
  args.dispatch(setActiveDocument(null))
  args.dispatch(clearDocumentNav())
  void args.navigate(ROUTES.home())
}

/** Close every unpinned tab except `keepId`; stay on that document. */
export function closeOtherTabs(args: {
  keepId: string
  dispatch: AppDispatch
  navigate: NavigateFn
}) {
  args.dispatch(closeOtherOpenDocuments(args.keepId))
  const cached = peekCachedDocument(args.keepId)
  if (cached) args.dispatch(setActiveDocument(cached))
  else prefetchDocument(args.keepId)
  void args.navigate(ROUTES.document(args.keepId))
}

/** Follow a wiki link — records the current document on the back trail. */
export function navigateViaWikiLink(args: {
  fromId: string | null
  targetId: string
  dispatch: AppDispatch
  navigate: NavigateFn
}) {
  if (args.fromId && args.fromId !== args.targetId) {
    args.dispatch(pushDocumentNav(args.fromId))
  }
  args.dispatch(setActiveDocumentId(args.targetId))
  const cached = peekCachedDocument(args.targetId)
  if (cached) args.dispatch(setActiveDocument(cached))
  else prefetchDocument(args.targetId)
  void args.navigate(ROUTES.document(args.targetId))
}

/** Go back along the wiki-link trail. */
export function navigateWikiBack(args: {
  documentNavStack: string[]
  dispatch: AppDispatch
  navigate: NavigateFn
}) {
  const prev = args.documentNavStack[args.documentNavStack.length - 1]
  if (!prev) return
  args.dispatch(popDocumentNav())
  args.dispatch(setActiveDocumentId(prev))
  const cached = peekCachedDocument(prev)
  if (cached) args.dispatch(setActiveDocument(cached))
  else prefetchDocument(prev)
  void args.navigate(ROUTES.document(prev))
}

/** Jump to an intermediate breadcrumb and trim the trail. */
export function navigateToBreadcrumb(args: {
  targetId: string
  dispatch: AppDispatch
  navigate: NavigateFn
}) {
  args.dispatch(trimDocumentNavTo(args.targetId))
  args.dispatch(setActiveDocumentId(args.targetId))
  const cached = peekCachedDocument(args.targetId)
  if (cached) args.dispatch(setActiveDocument(cached))
  else prefetchDocument(args.targetId)
  void args.navigate(ROUTES.document(args.targetId))
}
