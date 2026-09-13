import { GitBranch, Link2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type LinkGraphEmptyStateProps = {
  orphanCount: number
  showOrphans: boolean
  onShowOrphans?: () => void
  compact?: boolean
  className?: string
}

export function LinkGraphEmptyState({
  orphanCount,
  showOrphans,
  onShowOrphans,
  compact = false,
  className,
}: LinkGraphEmptyStateProps) {
  const { t } = useTranslation()
  const allLinked = showOrphans && orphanCount === 0
  const canRevealOrphans = !showOrphans && orphanCount > 0

  return (
    <div className={cn('link-graph-empty', compact && 'link-graph-empty--compact', className)}>
      <div className="link-graph-empty__glow" aria-hidden="true" />
      <div className="link-graph-empty__constellation" aria-hidden="true">
        <svg viewBox="0 0 160 100" className="link-graph-empty__svg" fill="none">
          <path
            d="M28 62 L54 34 L86 48 L118 28 L138 58"
            className="link-graph-empty__lines"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="28" cy="62" r="4.5" className="link-graph-empty__star" />
          <circle cx="54" cy="34" r="5.5" className="link-graph-empty__star link-graph-empty__star--hot" />
          <circle cx="86" cy="48" r="4" className="link-graph-empty__star" />
          <circle cx="118" cy="28" r="6" className="link-graph-empty__star link-graph-empty__star--hot" />
          <circle cx="138" cy="58" r="3.5" className="link-graph-empty__star" />
          <circle cx="72" cy="72" r="2.5" className="link-graph-empty__star link-graph-empty__star--dim" />
          <circle cx="102" cy="70" r="2" className="link-graph-empty__star link-graph-empty__star--dim" />
        </svg>
      </div>

      <div className="link-graph-empty__card">
        <div className="link-graph-empty__icon" aria-hidden="true">
          <GitBranch className="h-5 w-5" />
        </div>
        <p className="link-graph-empty__eyebrow">{t('linkGraph.eyebrow')}</p>
        <h2 className="link-graph-empty__title">
          {allLinked ? t('linkGraph.emptyOrphans') : t('linkGraph.empty')}
        </h2>
        <p className="link-graph-empty__body">
          {canRevealOrphans
            ? t('linkGraph.orphanHint', { count: orphanCount })
            : allLinked
              ? t('linkGraph.emptyHintLinked')
              : t('linkGraph.emptyHint')}
        </p>

        {canRevealOrphans && onShowOrphans ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="link-graph-empty__cta"
            onClick={onShowOrphans}
          >
            {t('linkGraph.showOrphans')}
            <span className="link-graph-empty__count">{orphanCount}</span>
          </Button>
        ) : null}

        {!canRevealOrphans && !allLinked ? (
          <p className="link-graph-empty__tip">
            <Link2 className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            <span>{t('linkGraph.emptyTipWiki')}</span>
          </p>
        ) : null}
      </div>
    </div>
  )
}
