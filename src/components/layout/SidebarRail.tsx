import { useMemo } from 'react'
import { BookOpen, FileText, Home, Settings2 } from 'lucide-react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { goToHome } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
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
    <div className="app-sidebar-rail titlebar-no-drag">
      <button
        type="button"
        className="app-rail-mark mb-1"
        title={t('nav.home')}
        aria-label={t('nav.home')}
        onClick={() => {
          goToHome({ dispatch, navigate })
          onNavigate?.()
        }}
      >
        S
      </button>

      <button
        type="button"
        title={t('nav.home')}
        aria-label={t('nav.home')}
        onClick={() => {
          goToHome({ dispatch, navigate })
          onNavigate?.()
        }}
        className={cn('app-rail-btn titlebar-no-drag', onHomePage && !activeDocumentId && 'is-active')}
      >
        <Home className="h-[18px] w-[18px]" />
      </button>

      <Link
        {...editorLink}
        title={t('nav.editor')}
        aria-label={t('nav.editor')}
        onClick={() => onNavigate?.()}
        className={cn(
          'app-rail-btn titlebar-no-drag',
          onEditorPage && Boolean(activeDocumentId) && 'is-active',
        )}
      >
        <FileText className="h-[18px] w-[18px]" />
      </Link>

      <Link
        {...ROUTES.docs()}
        title={t('nav.docs')}
        aria-label={t('nav.docs')}
        onClick={() => onNavigate?.()}
        className={cn('app-rail-btn titlebar-no-drag', onDocsPage && 'is-active')}
      >
        <BookOpen className="h-[18px] w-[18px]" />
      </Link>

      <Link
        to="/settings/appearance"
        title={t('nav.settings')}
        aria-label={t('nav.settings')}
        onClick={() => onNavigate?.()}
        className={cn('app-rail-btn titlebar-no-drag', onSettingsPage && 'is-active')}
      >
        <Settings2 className="h-[18px] w-[18px]" />
      </Link>
    </div>
  )
}
