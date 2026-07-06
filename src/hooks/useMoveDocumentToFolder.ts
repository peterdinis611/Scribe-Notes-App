import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { moveDocumentToFolder } from '@/lib/db/api'
import { toast } from '@/lib/toast'
import { updateDocuments } from '@/store/documentsSlice'
import { updateExpandedFolderIds } from '@/store/foldersSlice'

export function useMoveDocumentToFolder() {
  const folders = useAppSelector((state) => state.folders.folders)
  const dispatch = useAppDispatch()

  return async function moveDocument(documentId: string, folderId: string | null) {
    await moveDocumentToFolder(documentId, folderId)
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

    const folderName = folderId
      ? folders.find((folder) => folder.id === folderId)?.name ?? 'Priečinok'
      : 'Koreň knižnice'
    toast.success('Dokument presunutý', folderName)
  }
}
