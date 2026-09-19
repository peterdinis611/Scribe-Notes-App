import { clearDocumentCache } from '@/lib/cache/document-cache'
import { listLibraries, switchLibrary } from '@/lib/db/libraries-api'
import { reloadLibraryFromBackend } from '@/lib/library-reload'
import { goToHome } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import type { AppDispatch } from '@/store/index'
import { setLibraries } from '@/store/librariesSlice'
import i18n from '@/i18n'

export async function activateLibrary(
  dispatch: AppDispatch,
  navigate: (route: ReturnType<typeof ROUTES.home>) => void | Promise<void>,
  id: string,
) {
  await switchLibrary(id)
  clearDocumentCache()
  const libraries = await listLibraries()
  dispatch(setLibraries(libraries))
  await reloadLibraryFromBackend(dispatch)
  goToHome({ dispatch, navigate })
  const active = libraries.find((item) => item.isActive)
  toast.success(
    i18n.t('libraries.switchedTitle'),
    active ? i18n.t('libraries.switchedHint', { name: active.name }) : '',
  )
}
