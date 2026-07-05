import { lazy, Suspense, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { ROUTES } from '@/lib/routes'
import { activeDocumentAtom, activeDocumentIdAtom, saveStatusAtom } from '@/store/documents'

const DocumentEditor = lazy(() =>
  import('@/components/DocumentEditor').then((module) => ({
    default: module.DocumentEditor,
  })),
)

function DocumentEditorFallback() {
  return (
    <div className="editor-shell">
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        Načítavam editor…
      </div>
    </div>
  )
}

export function DocumentPage() {
  const { documentId } = useParams({ strict: false })
  const navigate = useNavigate()
  const [activeId, setActiveId] = useAtom(activeDocumentIdAtom)
  const activeDocument = useAtomValue(activeDocumentAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const [saveStatus] = useAtom(saveStatusAtom)

  const resolvedDocument = useMemo(() => {
    if (!documentId) return null
    if (activeDocument?.id === documentId) return activeDocument
    return peekCachedDocument(documentId)
  }, [activeDocument, documentId])

  useEffect(() => {
    if (!documentId) return
    if (activeId !== documentId) setActiveId(documentId)
    if (resolvedDocument && activeDocument?.id !== documentId) {
      setActiveDocument(resolvedDocument)
    }
  }, [activeDocument?.id, activeId, documentId, resolvedDocument, setActiveDocument, setActiveId])

  useEffect(() => {
    if (activeId === documentId && saveStatus === 'error' && !resolvedDocument) {
      navigate(ROUTES.home())
    }
  }, [activeId, documentId, resolvedDocument, saveStatus, navigate])

  if (!documentId || !resolvedDocument || resolvedDocument.id !== documentId) {
    return (
      <div className="editor-shell">
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
          Načítavam dokument…
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={<DocumentEditorFallback />}>
      <DocumentEditor />
    </Suspense>
  )
}
