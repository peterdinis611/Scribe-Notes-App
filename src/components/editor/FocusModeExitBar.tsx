import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Focus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setFocusMode } from '@/store/documentsSlice'

export function FocusModeExitBar() {
  const { t } = useTranslation()
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (!focusMode) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      dispatch(setFocusMode(false))
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [dispatch, focusMode])

  if (!focusMode) return null

  return (
    <div className="editor-focus-exit-bar titlebar-no-drag">
      <Button
        variant="outline"
        size="sm"
        className="editor-focus-exit shadow-md"
        title={t('focusMode.exitHint')}
        onClick={() => dispatch(setFocusMode(false))}
      >
        <Focus className="h-3.5 w-3.5 shrink-0" />
        {t('focusMode.exit')}
        <kbd className="editor-focus-exit-kbd">Esc</kbd>
      </Button>
    </div>
  )
}
