import { lazy, Suspense, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { isCanvasContent } from '@/lib/canvas/types'
import { ROUTES } from '@/lib/routes'
import { isOpenLibraryDocumentId } from '@/lib/trash-document'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setActiveDocumentId,
} from '@/store/documentsSlice'
import { SecondaryDocumentPane } from '@/components/SecondaryDocumentPane'

const DocumentEditor = lazy(() =>
  import('@/components/DocumentEditor').then((module) => ({
    default: module.DocumentEditor,
  })),
)

const CanvasEditor = lazy(() =>
  import('@/components/canvas/CanvasEditor').then((module) => ({
    default: module.CanvasEditor,
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
  const documents = useAppSelector((state) => state.documents.documents)
  const secondaryDocumentId = useAppSelector((state) => state.documents.secondaryDocumentId)
  const saveStatus = useAppSelector((state) => state.documents.saveStatus)
  const dispatch = useAppDispatch()
  /** Tracks which route id we already adopted so close/home can clear activeId without revival. */
  const adoptedRouteIdRef = useRef<string | null>(null)

  const resolvedDocument = useMemo(() => {
    if (!documentId) return null
    if (activeDocument?.id === documentId) return activeDocument
    return peekCachedDocument(documentId)
  }, [activeDocument, documentId])

  useEffect(() => {
    if (!documentId) return

    const routeInLibrary = isOpenLibraryDocumentId(documents, documentId)
    // After trash, activeId moves first while the URL briefly still points at the
    // trashed doc — never fight that by re-adopting the stale route id.
    if (activeId != null && activeId !== documentId && !routeInLibrary) {
      return
    }

    if (activeId === null) {
      // First open of this route (cold link / refresh). Skip if we already adopted
      // this id — that means the user closed it or went home while URL still matched.
      if (adoptedRouteIdRef.current === documentId) return
      // Library already loaded and this id is gone (trashed) — go home instead of reviving.
      if (documents.length > 0 && !routeInLibrary) {
        void navigate(ROUTES.home())
        return
      }
      adoptedRouteIdRef.current = documentId
      dispatch(setActiveDocumentId(documentId))
    } else {
      adoptedRouteIdRef.current = documentId
      if (activeId !== documentId) dispatch(setActiveDocumentId(documentId))
    }

    if (resolvedDocument && activeDocument?.id !== documentId) {
      dispatch(setActiveDocument(resolvedDocument))
    }
  }, [
    activeDocument?.id,
    activeId,
    dispatch,
    documentId,
    documents,
    navigate,
    resolvedDocument,
  ])

  useEffect(() => {
    if (activeId === documentId && saveStatus === 'error' && !resolvedDocument) {
      dispatch(setActiveDocumentId(null))
      dispatch(setActiveDocument(null))
      navigate(ROUTES.home())
    }
  }, [activeId, documentId, resolvedDocument, saveStatus, navigate, dispatch])

  const isCanvas = useMemo(() => {
    if (!resolvedDocument) return false
    try {
      return isCanvasContent(JSON.parse(resolvedDocument.contentJson))
    } catch {
      return false
    }
  }, [resolvedDocument])

  if (!documentId || !resolvedDocument || resolvedDocument.id !== documentId) {
    return (
      <div className="editor-shell">
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
          {t('editor.loading')}
        </div>
      </div>
    )
  }

  const split = Boolean(secondaryDocumentId && secondaryDocumentId !== documentId)

  const editor = (
    <Suspense fallback={<DocumentEditorFallback />}>
      {isCanvas ? (
        <CanvasEditor key={documentId} />
      ) : (
        <DocumentEditor key={documentId} />
      )}
    </Suspense>
  )

  if (!split || !secondaryDocumentId) {
    return editor
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">{editor}</div>
      <SecondaryDocumentPane key={secondaryDocumentId} documentId={secondaryDocumentId} />
    </div>
  )
}
