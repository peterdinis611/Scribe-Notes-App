import { useAtomValue, useSetAtom } from 'jotai'
import { moveDocumentToFolder } from '@/lib/db/api'
import { toast } from '@/lib/toast'
import { documentsAtom } from '@/store/documents'
import { expandedFolderIdsAtom, foldersAtom } from '@/store/folders'

export function useMoveDocumentToFolder() {
  const folders = useAtomValue(foldersAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const setExpandedIds = useSetAtom(expandedFolderIdsAtom)

  return async function moveDocument(documentId: string, folderId: string | null) {
    await moveDocumentToFolder(documentId, folderId)
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === documentId ? { ...doc, folderId } : doc)),
    )
    if (folderId) {
      setExpandedIds((prev: Set<string>) => new Set(prev).add(folderId))
    }

    const folderName = folderId
      ? folders.find((folder) => folder.id === folderId)?.name ?? 'Priečinok'
      : 'Koreň knižnice'
    toast.success('Dokument presunutý', folderName)
  }
}
