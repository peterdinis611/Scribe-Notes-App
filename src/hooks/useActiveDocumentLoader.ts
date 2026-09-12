import { useEffect, useRef } from 'react'
import { fetchDocumentFresh, getDocument } from '@/lib/db/api'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocument, setSaveStatus } from '@/store/documentsSlice'

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

    async function load() {
      try {
        // Cache hit: soft-revalidate in background. Miss: load once via getDocument.
        const doc = cached
          ? await fetchDocumentFresh(documentId)
          : await getDocument(documentId)
        if (cancelled) return

        const status = saveStatusRef.current
        if (status === 'dirty' || status === 'saving') return

        if (
          !cached ||
          cached.updatedAt !== doc.updatedAt ||
          cached.contentJson !== doc.contentJson
        ) {
          dispatch(setActiveDocument(doc))
        }

        dispatch(setSaveStatus('saved'))
      } catch {
        if (!cancelled && !cached) dispatch(setSaveStatus('error'))
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [activeId, dispatch])
}
