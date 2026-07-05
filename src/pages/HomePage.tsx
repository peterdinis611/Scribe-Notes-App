import { useLayoutEffect } from 'react'
import { useSetAtom } from 'jotai'
import { EditorHeader } from '@/components/TopBar'
import { WelcomeScreen } from '@/components/WelcomeScreen'
import { activeDocumentAtom, activeDocumentIdAtom } from '@/store/documents'

export function HomePage() {
  const setActiveId = useSetAtom(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)

  useLayoutEffect(() => {
    setActiveId(null)
    setActiveDocument(null)
  }, [setActiveDocument, setActiveId])

  return (
    <div className="editor-shell">
      <EditorHeader />
      <WelcomeScreen />
    </div>
  )
}
