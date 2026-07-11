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
    const { activeDocument, documents } = store.getState().documents
    const previousSummary = documents.find((item) => item.id === id)
    const previousActive = activeDocument?.id === id ? activeDocument : null

    dispatch(setSaveStatus('saving'))
    dispatch(
      updateDocuments((prevDocs) =>
        prevDocs.map((item) => (item.id === id ? { ...item, title: trimmed } : item)),
      ),
    )
    if (previousActive) {
      dispatch(setActiveDocument({ ...previousActive, title: trimmed }))
    }

    try {
      const updated = await updateDocument({ id, title: trimmed })
      dispatch(markDocumentTitleManual(id))
      const currentActive = store.getState().documents.activeDocument
      dispatch(setActiveDocument(currentActive?.id === id ? updated : currentActive))
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
      if (previousSummary) {
        dispatch(
          updateDocuments((prevDocs) =>
            prevDocs.map((item) => (item.id === id ? previousSummary : item)),
          ),
        )
      }
      if (previousActive) {
        dispatch(setActiveDocument(previousActive))
      }
      dispatch(setSaveStatus('error'))
      toast.error('Premenovanie zlyhalo')
      return null
    }
  }
}
