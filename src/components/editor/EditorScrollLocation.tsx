import { ListTree } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DocumentOutlineItem } from '@/lib/editor/document-outline'
import { cn } from '@/lib/utils'

type EditorScrollLocationProps = {
  heading: DocumentOutlineItem | null
  headingCount: number
  onOpenOutline: () => void
  onJumpToHeading?: () => void
  className?: string
}

/** Always-visible “you are here” cue while scrolling long documents. */
export function EditorScrollLocation({
  heading,
  headingCount,
  onOpenOutline,
  onJumpToHeading,
  className,
}: EditorScrollLocationProps) {
  const { t } = useTranslation()

  if (headingCount === 0) return null

  const label = heading?.preview || heading?.label || t('panels.outline.topOfDocument')

  return (
    <div className={cn('editor-scroll-location titlebar-no-drag', className)} role="status">
      <button
        type="button"
        className="editor-scroll-location-main"
        onClick={onJumpToHeading ?? onOpenOutline}
        title={t('panels.outline.youAreHereHint')}
      >
        <span className="editor-scroll-location-kicker">{t('panels.outline.youAreHere')}</span>
        <span className="editor-scroll-location-title">{label}</span>
      </button>
      <button
        type="button"
        className="editor-scroll-location-outline"
        onClick={onOpenOutline}
        title={t('editorPanels.outline')}
        aria-label={t('editorPanels.outline')}
      >
        <ListTree className="h-3.5 w-3.5" />
        <span>{t('panels.outline.openOutline')}</span>
      </button>
    </div>
  )
}
