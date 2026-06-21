import { useEffect } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useAtom, useAtomValue } from 'jotai'
import { DocumentEditor } from '@/components/DocumentEditor'
import { ROUTES } from '@/lib/routes'
import { activeDocumentAtom, activeDocumentIdAtom, saveStatusAtom } from '@/store/documents'

export function DocumentPage() {
  const { documentId } = useParams({ from: '/doc/$documentId' })
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

  return <DocumentEditor />
}
