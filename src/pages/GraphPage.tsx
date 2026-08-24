import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, GitBranch } from 'lucide-react'
import { LibraryLinkGraphView } from '@/components/LibraryLinkGraphView'
import { Button } from '@/components/ui/button'
import { goToHome } from '@/lib/navigation'
import { useAppDispatch } from '@/store/hooks'

export function GraphPage() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const around = useRouterState({
    select: (state) => Boolean((state.location.search as { around?: boolean }).around),
  })

  return (
    <div className="link-graph-page flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <header className="titlebar-no-drag flex shrink-0 items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-5 sm:px-8">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-[var(--color-accent)]">
            <GitBranch className="h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-foreground)]">
              {t('linkGraph.eyebrow')}
            </p>
          </div>
          <h1 className="m-0 font-[family-name:var(--font-display)] text-[clamp(22px,3vw,28px)] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">
            {t('linkGraph.pageTitle')}
          </h1>
          <p className="m-0 max-w-[52ch] text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
            {t('linkGraph.pageSubtitle')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => goToHome({ dispatch, navigate })}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('nav.home')}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <LibraryLinkGraphView variant="page" initialAroundActive={around} />
      </div>
    </div>
  )
}
