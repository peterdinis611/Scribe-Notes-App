import { useEffect } from 'react'
import { BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setReadingMode } from '@/store/documentsSlice'

export function ReadingModeExitBar() {
  const readingMode = useAppSelector((state) => state.documents.readingMode)
  const dispatch = useAppDispatch()
  const { t } = useTranslation()

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

  if (!readingMode) return null

  return (
    <div className="editor-reading-exit-bar titlebar-no-drag">
      <Button
        variant="outline"
        size="sm"
        className="editor-reading-exit shadow-md"
        title={t('readingMode.exitHint')}
        onClick={() => dispatch(setReadingMode(false))}
      >
        <BookOpen className="h-3.5 w-3.5 shrink-0" />
        {t('readingMode.exit')}
        <kbd className="editor-focus-exit-kbd">Esc</kbd>
      </Button>
    </div>
  )
}
