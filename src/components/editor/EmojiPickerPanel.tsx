import { lazy, Suspense } from 'react'
import type { Editor } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { SuspenseFallback } from '@/components/ui/spinner'

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
          <SuspenseFallback
            fill={false}
            size="sm"
            label={t('common.loading')}
            className="emoji-picker-panel__loading"
          />
        }
      >
        <LazyEmojiPicker editor={editor} onClose={onClose} />
      </Suspense>
    </div>
  )
}
