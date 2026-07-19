import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { store } from '@/store/index'
import { moveDocumentToFolder } from '@/lib/db/api'
import i18n from '@/i18n'
import { toast } from '@/lib/toast'
import { updateDocuments } from '@/store/documentsSlice'
import { updateExpandedFolderIds } from '@/store/foldersSlice'

export function useMoveDocumentToFolder() {
  const folders = useAppSelector((state) => state.folders.folders)
  const dispatch = useAppDispatch()

  return async function moveDocument(documentId: string, folderId: string | null) {
    const current = store.getState().documents.documents.find((doc) => doc.id === documentId)
    if (!current || current.folderId === folderId) return

    const previousFolderId = current.folderId

    dispatch(
      updateDocuments((prev) =>
        prev.map((doc) => (doc.id === documentId ? { ...doc, folderId } : doc)),
      ),
    )
    if (folderId) {
      dispatch(
        updateExpandedFolderIds((prev) =>
          prev.includes(folderId) ? prev : [...prev, folderId],
        ),
      )
    }

    try {
      await moveDocumentToFolder(documentId, folderId)
      const folderName = folderId
        ? folders.find((folder) => folder.id === folderId)?.name ?? i18n.t('common.folder')
        : i18n.t('library.rootLibrary')
      toast.success(i18n.t('toasts.documentMoved'), folderName)
    } catch (error) {
      dispatch(
        updateDocuments((prev) =>
          prev.map((doc) =>
            doc.id === documentId ? { ...doc, folderId: previousFolderId } : doc,
          ),
        ),
      )
      toast.error(i18n.t('toasts.moveError'), String(error))
    }
  }
}
