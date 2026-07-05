import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { useRouterState } from '@tanstack/react-router'
import { WelcomeScreen } from '@/components/WelcomeScreen'
import { activeDocumentAtom, activeDocumentIdAtom } from '@/store/documents'

export function HomePage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const setActiveId = useSetAtom(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)

  useEffect(() => {
    if (pathname !== '/') return
    setActiveId(null)
    setActiveDocument(null)
  }, [pathname, setActiveDocument, setActiveId])

  return (
    <div className="editor-shell editor-shell--home">
      <WelcomeScreen />
    </div>
  )
}
