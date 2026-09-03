import { lazy, Suspense } from 'react'
import type { Editor } from '@tiptap/react'
import { useTranslation } from 'react-i18next'

const LazyEmojiPicker = lazy(() => import('./EmojiPickerInner'))

type EmojiPickerPanelProps = {
  editor: Editor
  onClose?: () => void
}

export function EmojiPickerPanel({ editor, onClose }: EmojiPickerPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="emoji-picker-panel titlebar-no-drag">
      <Suspense
        fallback={
          <div className="emoji-picker-panel__loading" aria-busy="true">
            {t('common.loading')}
          </div>
        }
      >
        <LazyEmojiPicker editor={editor} onClose={onClose} />
      </Suspense>
    </div>
  )
}
