import { useEffect } from 'react'
import { setRetainedDocumentIds } from '@/lib/cache/document-cache'
import { useAppSelector } from '@/store/hooks'

/** Pin open / active / split-pane docs so LRU eviction never drops them. */
export function useDocumentCacheRetention() {
  const openDocumentIds = useAppSelector((state) => state.documents.openDocumentIds)
  const activeDocumentId = useAppSelector((state) => state.documents.activeDocumentId)
  const secondaryDocumentId = useAppSelector((state) => state.documents.secondaryDocumentId)

  useEffect(() => {
    const ids = new Set<string>(openDocumentIds)
    if (activeDocumentId) ids.add(activeDocumentId)
    if (secondaryDocumentId) ids.add(secondaryDocumentId)
    setRetainedDocumentIds(ids)
  }, [activeDocumentId, openDocumentIds, secondaryDocumentId])
}
