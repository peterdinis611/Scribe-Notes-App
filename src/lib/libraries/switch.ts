import { clearDocumentCache } from '@/lib/cache/document-cache'
import { listLibraries, listSyncConflicts, switchLibrary } from '@/lib/db/libraries-api'
import { reloadLibraryFromBackend } from '@/lib/library-reload'
import { loadLibrarySession } from '@/lib/libraries/session'
import { reloadCustomTemplatesCollection } from '@/lib/db/template-collections'
import { goToHome } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import type { AppDispatch } from '@/store/index'
import { setLibraries, setOpenConflictCount } from '@/store/librariesSlice'
import i18n from '@/i18n'

export async function activateLibrary(
  dispatch: AppDispatch,
  navigate: (route: ReturnType<typeof ROUTES.home>) => void | Promise<void>,
  id: string,
) {
  loadLibrarySession(dispatch, id)
  await switchLibrary(id)
  clearDocumentCache()
  const libraries = await listLibraries()
  dispatch(setLibraries(libraries))
  await reloadLibraryFromBackend(dispatch)
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
  goToHome({ dispatch, navigate })
  const active = libraries.find((item) => item.isActive)
  toast.success(
    i18n.t('libraries.switchedTitle'),
    active ? i18n.t('libraries.switchedHint', { name: active.name }) : '',
  )
}
