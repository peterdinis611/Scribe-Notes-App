import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { store } from '@/store/index'
import { moveDocumentsToFolder, moveDocumentToFolder } from '@/lib/db/api'
import i18n from '@/i18n'
import { toast } from '@/lib/toast'
import { clearSelectedDocuments, updateDocuments } from '@/store/documentsSlice'
import { updateExpandedFolderIds } from '@/store/foldersSlice'

function folderLabel(
  folders: { id: string; name: string }[],
  folderId: string | null,
): string {
  if (!folderId) return i18n.t('library.rootLibrary')
  return folders.find((folder) => folder.id === folderId)?.name ?? i18n.t('common.folder')
}

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
      toast.success(i18n.t('toasts.documentMoved'), folderLabel(folders, folderId))
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
      if (toMove.length === 1) {
        await moveDocumentToFolder(toMove[0]!, folderId)
      } else {
        await moveDocumentsToFolder(toMove, folderId)
        dispatch(clearSelectedDocuments())
      }
      const label = folderLabel(folders, folderId)
      toast.success(
        i18n.t('toasts.documentMoved'),
        toMove.length > 1 ? `${toMove.length} → ${label}` : label,
      )
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
