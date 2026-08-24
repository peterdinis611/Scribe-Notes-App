import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { WelcomeScreen } from '@/components/WelcomeScreen'
import { ROUTES } from '@/lib/routes'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocument, setActiveDocumentId } from '@/store/documentsSlice'

function isOpenDocument(
  documents: { id: string; deletedAt: number | null }[],
  id: string,
) {
  return documents.some((doc) => doc.id === id && doc.deletedAt == null)
}

export function HomePage() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const openDocumentIds = useAppSelector((state) => state.documents.openDocumentIds)
  const documents = useAppSelector((state) => state.documents.documents)

  // Session restore only: reopen a still-open tab when landing on `/`.
  // Do not bounce back when the user closed the last tab / went home (active cleared
  // or removed from open tabs).
  const shouldRestoreDocument = Boolean(
    activeId &&
      openDocumentIds.includes(activeId) &&
      isOpenDocument(documents, activeId),
  )

  useEffect(() => {
    if (!activeId) return
    if (documents.length === 0) return

    if (openDocumentIds.includes(activeId) && isOpenDocument(documents, activeId)) {
      void navigate(ROUTES.document(activeId))
      return
    }

    // Stale persisted active id with no open tab — clear and stay on welcome.
    dispatch(setActiveDocumentId(null))
    dispatch(setActiveDocument(null))
  }, [activeId, documents, dispatch, navigate, openDocumentIds])

  if (shouldRestoreDocument) return null

  return (
    <div className="editor-shell editor-shell--home">
      <WelcomeScreen />
    </div>
  )
}
