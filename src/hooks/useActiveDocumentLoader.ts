import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { fetchDocumentFresh } from '@/lib/db/api'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { activeDocumentAtom, activeDocumentIdAtom, saveStatusAtom } from '@/store/documents'
import { useAtomValue } from 'jotai'

export function useActiveDocumentLoader() {
  const activeId = useAtomValue(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setSaveStatus = useSetAtom(saveStatusAtom)

  useEffect(() => {
    if (!activeId) {
      setActiveDocument(null)
      return
    }

    const documentId = activeId
    let cancelled = false

    const cached = peekCachedDocument(documentId)
    if (cached) {
      setActiveDocument(cached)
      setSaveStatus('saved')
    } else {
      setActiveDocument(null)
    }

    async function loadFresh() {
      try {
        const doc = await fetchDocumentFresh(documentId)
        if (cancelled) return

        const fresh = doc

        if (!cached || cached.updatedAt !== fresh.updatedAt) {
          setActiveDocument(fresh)
        }

        setSaveStatus('saved')
      } catch {
        if (!cancelled && !cached) setSaveStatus('error')
      }
    }

    void loadFresh()

    return () => {
      cancelled = true
    }
  }, [activeId, setActiveDocument, setSaveStatus])
}
