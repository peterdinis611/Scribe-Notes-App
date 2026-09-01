import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setReadingMode } from '@/store/documentsSlice'

/** Escape-to-exit only — visible control lives in AppHeader to avoid overlapping chrome. */
export function ReadingModeExitBar() {
  const readingMode = useAppSelector((state) => state.documents.readingMode)
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (!readingMode) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      dispatch(setReadingMode(false))
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [dispatch, readingMode])

  return null
}
