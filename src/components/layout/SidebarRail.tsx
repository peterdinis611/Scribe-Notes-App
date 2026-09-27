import { useMemo } from 'react'
import { BookOpen, FileText, GitBranch, Home, Settings2 } from 'lucide-react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import scribeMarkUrl from '@/assets/brand/scribe-mark.svg'
import { goToHome } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { APP_SHORT_VERSION } from '@/lib/app-version'
import { cn } from '@/lib/utils'
import { IconTooltip } from '@/components/ui/tooltip'
import { useAppDispatch, useAppSelector } from '@/store/hooks'

type SidebarRailProps = {
  onNavigate?: () => void
}

export function SidebarRail({ onNavigate }: SidebarRailProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const activeDocumentId = useAppSelector((state) => state.documents.activeDocumentId)
  const documents = useAppSelector((state) => state.documents.documents)
  const onSettingsPage = pathname.startsWith('/settings')
  const onDocsPage = pathname === '/docs' || pathname.startsWith('/docs/')
  const onGraphPage = pathname === '/graph'
  const onHomePage = pathname === '/'
  const onEditorPage = pathname === '/' || pathname.startsWith('/doc/')

  const editorLink = useMemo(() => {
    if (
      activeDocumentId &&
      documents.some((doc) => doc.id === activeDocumentId && doc.deletedAt == null)
    ) {
      return ROUTES.document(activeDocumentId)
    }
    return ROUTES.home()
  }, [activeDocumentId, documents])

  return (
    <div className="app-sidebar-rail titlebar-no-drag" data-tour="sidebar-rail">
      <IconTooltip label={t('welcome.brandWithEdition', { version: APP_SHORT_VERSION })} side="right">
        <button
          type="button"
          className="app-rail-mark mb-1"
          aria-label={t('welcome.brandWithEdition', { version: APP_SHORT_VERSION })}
          onClick={() => {
            goToHome({ dispatch, navigate })
            onNavigate?.()
          }}
        >
          <img src={scribeMarkUrl} alt="" width={18} height={18} draggable={false} />
        </button>
      </IconTooltip>

      <IconTooltip label={t('nav.home')} side="right">
        <button
          type="button"
          aria-label={t('nav.home')}
          onClick={() => {
            goToHome({ dispatch, navigate })
            onNavigate?.()
          }}
          className={cn('app-rail-btn titlebar-no-drag', onHomePage && !activeDocumentId && 'is-active')}
        >
          <Home className="h-[18px] w-[18px]" />
        </button>
      </IconTooltip>

      <IconTooltip label={t('nav.editor')} side="right">
        <Link
          {...editorLink}
          aria-label={t('nav.editor')}
          onClick={() => onNavigate?.()}
          className={cn(
            'app-rail-btn titlebar-no-drag',
            onEditorPage && Boolean(activeDocumentId) && 'is-active',
          )}
        >
          <FileText className="h-[18px] w-[18px]" />
        </Link>
      </IconTooltip>

      <IconTooltip label={t('nav.graph')} side="right">
        <Link
          {...ROUTES.graph()}
          aria-label={t('nav.graph')}
          onClick={() => onNavigate?.()}
          className={cn('app-rail-btn titlebar-no-drag', onGraphPage && 'is-active')}
        >
          <GitBranch className="h-[18px] w-[18px]" />
        </Link>
      </IconTooltip>

      <IconTooltip label={t('nav.docs')} side="right">
        <Link
          {...ROUTES.docs()}
          aria-label={t('nav.docs')}
          onClick={() => onNavigate?.()}
          className={cn('app-rail-btn titlebar-no-drag', onDocsPage && 'is-active')}
        >
          <BookOpen className="h-[18px] w-[18px]" />
        </Link>
      </IconTooltip>

      <IconTooltip label={t('nav.settings')} side="right">
        <Link
          to="/settings/appearance"
          aria-label={t('nav.settings')}
          data-tour="settings-nav"
          onClick={() => onNavigate?.()}
          className={cn('app-rail-btn titlebar-no-drag', onSettingsPage && 'is-active')}
        >
          <Settings2 className="h-[18px] w-[18px]" />
        </Link>
      </IconTooltip>
    </div>
  )
}
