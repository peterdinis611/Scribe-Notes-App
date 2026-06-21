import { useSetAtom } from 'jotai'
import { moveDocumentToFolder } from '@/lib/db/api'
import { documentsAtom } from '@/store/documents'
import { expandedFolderIdsAtom } from '@/store/folders'

export function useMoveDocumentToFolder() {
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
  }
}
