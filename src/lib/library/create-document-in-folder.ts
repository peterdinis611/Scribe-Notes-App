import { createDocument } from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import type { AppDispatch } from '@/store/index'
import {
  setActiveDocument,
  setActiveDocumentId,
  setLibraryView,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'
import { updateExpandedFolderIds } from '@/store/foldersSlice'

type Translate = (key: string, options?: Record<string, unknown>) => string

/** Create a blank page inside a folder and open it. */
export async function createDocumentInFolder({
  folderId,
  t,
  dispatch,
  navigate,
  title,
}: {
  folderId: string | null
  t: Translate
  dispatch: AppDispatch
  navigate: (route: ReturnType<typeof ROUTES.document>) => void | Promise<void>
  title?: string
}) {
  try {
    const document = await createDocument({
      title: title ?? t('library.untitledPage'),
      folderId,
      contentJson: JSON.stringify({ type: 'doc', content: [] }),
    })

    if (folderId) {
      dispatch(
        updateExpandedFolderIds((prev) =>
          prev.includes(folderId) ? prev : [...prev, folderId],
        ),
      )
    }
    dispatch(setLibraryView('folders'))
    dispatch(updateDocuments((prev) => prependDocumentSummary(prev, document)))
    dispatch(setActiveDocumentId(document.id))
    dispatch(setActiveDocument(document))
    dispatch(setSaveStatus('saved'))
    await navigate(ROUTES.document(document.id))
    toast.success(t('toasts.documentCreated'), document.title.trim() || t('library.untitledPage'))
    return document
  } catch (error) {
    toast.error(t('toasts.documentCreateError'), String(error))
    return null
  }
}
