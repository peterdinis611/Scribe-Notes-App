import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { store } from '@/store/index'
import { moveDocumentsToFolder, moveDocumentToFolder } from '@/lib/db/api'
import i18n from '@/i18n'
import { toast } from '@/lib/toast'
import { clearSelectedDocuments, updateDocuments } from '@/store/documentsSlice'
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

/** Bulk move for multi-select / bulk bar. */
export function useMoveDocumentsToFolder() {
  const folders = useAppSelector((state) => state.folders.folders)
  const dispatch = useAppDispatch()

  return async function moveDocuments(documentIds: string[], folderId: string | null) {
    const uniqueIds = [...new Set(documentIds.filter(Boolean))]
    if (uniqueIds.length === 0) return

    if (uniqueIds.length === 1) {
      const single = useMoveDocumentToFolder()
      // Call the single-path logic inline to avoid hook misuse.
      const current = store.getState().documents.documents.find((doc) => doc.id === uniqueIds[0])
      if (!current || current.folderId === folderId) return
      const previousFolderId = current.folderId
      dispatch(
        updateDocuments((prev) =>
          prev.map((doc) => (doc.id === uniqueIds[0] ? { ...doc, folderId } : doc)),
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
        await moveDocumentToFolder(uniqueIds[0]!, folderId)
        const folderName = folderId
          ? folders.find((folder) => folder.id === folderId)?.name ?? i18n.t('common.folder')
          : i18n.t('library.rootLibrary')
        toast.success(i18n.t('toasts.documentMoved'), folderName)
      } catch (error) {
        dispatch(
          updateDocuments((prev) =>
            prev.map((doc) =>
              doc.id === uniqueIds[0] ? { ...doc, folderId: previousFolderId } : doc,
            ),
          ),
        )
        toast.error(i18n.t('toasts.moveError'), String(error))
      }
      return
    }

    const previous = new Map(
      uniqueIds.map((id) => {
        const doc = store.getState().documents.documents.find((item) => item.id === id)
        return [id, doc?.folderId ?? null] as const
      }),
    )
    const toMove = uniqueIds.filter((id) => previous.get(id) !== folderId)
    if (toMove.length === 0) return

    dispatch(
      updateDocuments((prev) =>
        prev.map((doc) => (toMove.includes(doc.id) ? { ...doc, folderId } : doc)),
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
      await moveDocumentsToFolder(toMove, folderId)
      const folderName = folderId
        ? folders.find((folder) => folder.id === folderId)?.name ?? i18n.t('common.folder')
        : i18n.t('library.rootLibrary')
      toast.success(i18n.t('toasts.documentMoved'), `${toMove.length} → ${folderName}`)
      dispatch(clearSelectedDocuments())
    } catch (error) {
      dispatch(
        updateDocuments((prev) =>
          prev.map((doc) =>
            toMove.includes(doc.id) ? { ...doc, folderId: previous.get(doc.id) ?? null } : doc,
          ),
        ),
      )
      toast.error(i18n.t('toasts.moveError'), String(error))
    }
  }
}
