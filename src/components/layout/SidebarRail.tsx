import { useMemo } from 'react'
import { FileText, Settings2 } from 'lucide-react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store/hooks'

type SidebarRailProps = {
  onNavigate?: () => void
}

export function SidebarRail({ onNavigate }: SidebarRailProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { t } = useTranslation()
  const activeDocumentId = useAppSelector((state) => state.documents.activeDocumentId)
  const documents = useAppSelector((state) => state.documents.documents)
  const onSettingsPage = pathname.startsWith('/settings')
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
      <div
        className="mb-1 flex h-7 w-7 items-center justify-center rounded-md text-[12px] font-semibold text-[var(--color-foreground)]"
        aria-hidden="true"
      >
        S
      </div>

      <Link
        {...editorLink}
        title={t('nav.editor')}
        aria-label={t('nav.editor')}
        onClick={() => onNavigate?.()}
        className={cn('app-rail-btn titlebar-no-drag', onEditorPage && 'is-active')}
      >
        <FileText className="h-[18px] w-[18px]" />
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
