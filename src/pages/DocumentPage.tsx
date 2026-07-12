import { lazy, Suspense, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { ROUTES } from '@/lib/routes'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setActiveDocumentId,
} from '@/store/documentsSlice'

const DocumentEditor = lazy(() =>
  import('@/components/DocumentEditor').then((module) => ({
    default: module.DocumentEditor,
  })),
)

function DocumentEditorFallback() {
  const { t } = useTranslation()

  return (
    <div className="editor-shell">
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        {t('editor.loadingEditor')}
      </div>
    </div>
  )
}

export function DocumentPage() {
  const { documentId } = useParams({ strict: false })
  const navigate = useNavigate()
  const { t } = useTranslation()
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const saveStatus = useAppSelector((state) => state.documents.saveStatus)
  const dispatch = useAppDispatch()

  const resolvedDocument = useMemo(() => {
    if (!documentId) return null
    if (activeDocument?.id === documentId) return activeDocument
    return peekCachedDocument(documentId)
  }, [activeDocument, documentId])

  useEffect(() => {
    if (!documentId) return
    if (activeId !== documentId) dispatch(setActiveDocumentId(documentId))
    if (resolvedDocument && activeDocument?.id !== documentId) {
      dispatch(setActiveDocument(resolvedDocument))
    }
  }, [activeDocument?.id, activeId, dispatch, documentId, resolvedDocument])

  useEffect(() => {
    if (activeId === documentId && saveStatus === 'error' && !resolvedDocument) {
      dispatch(setActiveDocumentId(null))
      dispatch(setActiveDocument(null))
      navigate(ROUTES.home())
    }
  }, [activeId, documentId, resolvedDocument, saveStatus, navigate, dispatch])

  if (!documentId || !resolvedDocument || resolvedDocument.id !== documentId) {
    return (
      <div className="editor-shell">
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
          {t('editor.loading')}
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={<DocumentEditorFallback />}>
      <DocumentEditor key={documentId} />
    </Suspense>
  )
}
