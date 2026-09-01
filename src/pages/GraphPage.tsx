import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
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
      <header className="link-graph-page-header titlebar-no-drag">
        <div className="min-w-0">
          <p className="link-graph-page-eyebrow">{t('linkGraph.eyebrow')}</p>
          <h1 className="link-graph-page-title">{t('linkGraph.pageTitle')}</h1>
          <p className="link-graph-page-subtitle mt-1 max-w-[48ch] text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
            {t('linkGraph.pageSubtitle')}
          </p>
          <p className="link-graph-page-hint mt-1 max-w-[52ch] text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
            {t('linkGraph.howToHint')}
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

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <LibraryLinkGraphView variant="page" initialAroundActive={around} />
      </div>
    </div>
  )
}
