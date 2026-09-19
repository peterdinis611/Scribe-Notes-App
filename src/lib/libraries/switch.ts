import { clearDocumentCache } from '@/lib/cache/document-cache'
import { listLibraries, listSyncConflicts, switchLibrary } from '@/lib/db/libraries-api'
import type { DocumentSummary } from '@/lib/db/api'
import { reloadLibraryFromBackend } from '@/lib/library-reload'
import { loadLibrarySession } from '@/lib/libraries/session'
import { reloadCustomTemplatesCollection } from '@/lib/db/template-collections'
import { goToHome } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { store, type AppDispatch } from '@/store/index'
import { setActiveDocumentId } from '@/store/documentsSlice'
import { setLibraries, setOpenConflictCount } from '@/store/librariesSlice'
import i18n from '@/i18n'

type NavigateFn = (
  route: ReturnType<typeof ROUTES.home> | ReturnType<typeof ROUTES.document>,
) => void | Promise<void>

function isOpenDoc(documents: DocumentSummary[], id: string | null | undefined): id is string {
  if (!id) return false
  return documents.some((doc) => doc.id === id && doc.deletedAt == null)
}

/** Prefer the restored tab, then recents, then the newest note in this library. */
export function resolveLibraryEditorDocumentId(state: {
  documents: DocumentSummary[]
  activeDocumentId: string | null
  openDocumentIds: string[]
  recentDocumentIds: string[]
}): string | null {
  const { documents, activeDocumentId, openDocumentIds, recentDocumentIds } = state
  if (isOpenDoc(documents, activeDocumentId)) return activeDocumentId
  const fromTabs = openDocumentIds.find((id) => isOpenDoc(documents, id))
  if (fromTabs) return fromTabs
  const fromRecent = recentDocumentIds.find((id) => isOpenDoc(documents, id))
  if (fromRecent) return fromRecent
  return documents.find((doc) => doc.deletedAt == null)?.id ?? null
}

export async function activateLibrary(dispatch: AppDispatch, navigate: NavigateFn, id: string) {
  loadLibrarySession(dispatch, id)
  await switchLibrary(id)
  clearDocumentCache()
  const libraries = await listLibraries()
  dispatch(setLibraries(libraries))
  await reloadLibraryFromBackend(dispatch, {
    preserveActive: true,
    refreshActive: true,
    getState: store.getState,
  })
  try {
    await reloadCustomTemplatesCollection()
  } catch {
    // Template collections are optional until Tauri IPC is ready.
  }
  try {
    dispatch(setOpenConflictCount((await listSyncConflicts()).length))
  } catch {
    dispatch(setOpenConflictCount(0))
  }

  const editorId = resolveLibraryEditorDocumentId(store.getState().documents)
  if (editorId) {
    dispatch(setActiveDocumentId(editorId))
    await navigate(ROUTES.document(editorId))
  } else {
    goToHome({ dispatch, navigate })
  }

  const active = libraries.find((item) => item.isActive)
  toast.success(
    i18n.t('libraries.switchedTitle'),
    active ? i18n.t('libraries.switchedHint', { name: active.name }) : '',
  )
}
