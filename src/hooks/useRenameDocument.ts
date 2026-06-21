import { useSetAtom } from 'jotai'
import { updateDocument } from '@/lib/db/api'
import {
  activeDocumentAtom,
  documentsAtom,
  markDocumentTitleManualAtom,
  saveStatusAtom,
} from '@/store/documents'

export function useRenameDocument() {
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const setSaveStatus = useSetAtom(saveStatusAtom)
  const markManual = useSetAtom(markDocumentTitleManualAtom)

  return async function renameDocument(id: string, title: string) {
    const trimmed = title.trim() || 'Bez názvu'

    setSaveStatus('saving')
    try {
      const updated = await updateDocument({ id, title: trimmed })
      markManual(id)
      setActiveDocument((prev) => (prev?.id === id ? updated : prev))
      setDocuments((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                title: updated.title,
                filePath: updated.filePath,
                updatedAt: updated.updatedAt,
              }
            : item,
        ),
      )
      setSaveStatus('saved')
      return updated
    } catch {
      setSaveStatus('error')
      return null
    }
  }
}
