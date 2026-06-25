import { lazy, Suspense, useEffect } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useAtom, useAtomValue } from 'jotai'
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
  const [activeId] = useAtom(activeDocumentIdAtom)
  const activeDocument = useAtomValue(activeDocumentAtom)
  const [saveStatus] = useAtom(saveStatusAtom)

  useEffect(() => {
    if (activeId === documentId && saveStatus === 'error' && !activeDocument) {
      navigate(ROUTES.home())
    }
  }, [activeId, documentId, activeDocument, saveStatus, navigate])

  if (activeId !== documentId || !activeDocument) {
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
