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
  const documents = useAppSelector((state) => state.documents.documents)
  const shouldRestoreDocument = activeId ? isOpenDocument(documents, activeId) : false

  useEffect(() => {
    if (!activeId) return

    if (isOpenDocument(documents, activeId)) {
      void navigate(ROUTES.document(activeId))
      return
    }

    dispatch(setActiveDocumentId(null))
    dispatch(setActiveDocument(null))
  }, [activeId, documents, dispatch, navigate])

  if (shouldRestoreDocument) return null

  return (
    <div className="editor-shell editor-shell--home">
      <WelcomeScreen />
    </div>
  )
}
