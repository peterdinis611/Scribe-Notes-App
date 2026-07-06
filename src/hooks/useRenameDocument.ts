import { updateDocument } from '@/lib/db/api'
import { toast } from '@/lib/toast'
import { store } from '@/store/index'
import { useAppDispatch } from '@/store/hooks'
import {
  markDocumentTitleManual,
  setActiveDocument,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'

export function useRenameDocument() {
  const dispatch = useAppDispatch()

  return async function renameDocument(id: string, title: string) {
    const trimmed = title.trim() || 'Bez názvu'

    dispatch(setSaveStatus('saving'))
    try {
      const updated = await updateDocument({ id, title: trimmed })
      dispatch(markDocumentTitleManual(id))
      const prev = store.getState().documents.activeDocument
      dispatch(setActiveDocument(prev?.id === id ? updated : prev))
      dispatch(
        updateDocuments((prevDocs) =>
          prevDocs.map((item) =>
            item.id === id
              ? {
                  ...item,
                  title: updated.title,
                  filePath: updated.filePath,
                  updatedAt: updated.updatedAt,
                }
              : item,
          ),
        ),
      )
      dispatch(setSaveStatus('saved'))
      toast.success('Dokument premenovaný', updated.title)
      return updated
    } catch {
      dispatch(setSaveStatus('error'))
      toast.error('Premenovanie zlyhalo')
      return null
    }
  }
}
