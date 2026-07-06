import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { WelcomeScreen } from '@/components/WelcomeScreen'
import { useAppDispatch } from '@/store/hooks'
import { setActiveDocument, setActiveDocumentId } from '@/store/documentsSlice'

export function HomePage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (pathname !== '/') return
    dispatch(setActiveDocumentId(null))
    dispatch(setActiveDocument(null))
  }, [dispatch, pathname])

  return (
    <div className="editor-shell editor-shell--home">
      <WelcomeScreen />
    </div>
  )
}
