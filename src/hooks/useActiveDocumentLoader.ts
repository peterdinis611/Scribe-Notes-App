import { useEffect, useRef } from 'react'
import { fetchDocumentFresh, getDocument } from '@/lib/db/api'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocument, setSaveStatus } from '@/store/documentsSlice'

/** Soft-revalidate is expensive for multi‑MB JSON — skip background IPC above this size. */
const SOFT_REVALIDATE_MAX_CHARS = 400_000

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
    }
    // Cache miss: keep any previous activeDocument until fetch completes so the
    // shell can keep showing the prior doc / loading title instead of flashing empty.

    async function load() {
      try {
        if (cached && cached.contentJson.length > SOFT_REVALIDATE_MAX_CHARS) {
          // Huge body already on screen — skip background full-blob revalidate.
          return
        }

        // Cache hit: soft-revalidate in background. Miss: load once via getDocument.
        const doc = cached
          ? await fetchDocumentFresh(documentId)
          : await getDocument(documentId)
        if (cancelled) return

        const status = saveStatusRef.current
        if (status === 'dirty' || status === 'saving') return

        // Prefer updatedAt — full contentJson === on multi‑MB strings is costly.
        if (!cached || cached.updatedAt !== doc.updatedAt) {
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
