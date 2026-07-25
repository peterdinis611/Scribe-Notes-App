import { useEffect, useRef } from 'react'
import { fetchDocumentFresh } from '@/lib/db/api'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setSaveStatus,
} from '@/store/documentsSlice'

export function useActiveDocumentLoader() {
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const saveStatus = useAppSelector((state) => state.documents.saveStatus)
  const saveStatusRef = useRef(saveStatus)
  const dispatch = useAppDispatch()
  saveStatusRef.current = saveStatus

  useEffect(() => {
    if (!activeId) {
      dispatch(setActiveDocument(null))
      return
    }

    const documentId = activeId
    let cancelled = false

    const cached = peekCachedDocument(documentId)
    if (cached) {
      dispatch(setActiveDocument(cached))
      dispatch(setSaveStatus('saved'))
    } else {
      dispatch(setActiveDocument(null))
    }

    async function loadFresh() {
      try {
        const doc = await fetchDocumentFresh(documentId)
        if (cancelled) return

        // Avoid overwriting in-progress edits if the user already typed.
        const status = saveStatusRef.current
        if (status === 'dirty' || status === 'saving') return

        if (!cached || cached.updatedAt !== doc.updatedAt) {
          dispatch(setActiveDocument(doc))
        }

        dispatch(setSaveStatus('saved'))
      } catch {
        if (!cancelled && !cached) dispatch(setSaveStatus('error'))
      }
    }

    void loadFresh()

    return () => {
      cancelled = true
    }
  }, [activeId, dispatch])
}
