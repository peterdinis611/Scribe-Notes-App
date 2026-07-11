import { useMemo } from 'react'
import { FileText, Settings2 } from 'lucide-react'
import { Link, useRouterState } from '@tanstack/react-router'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store/hooks'

type SidebarRailProps = {
  onNavigate?: () => void
}

export function SidebarRail({ onNavigate }: SidebarRailProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
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
        className="mb-2 flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--color-accent)] text-[13px] font-bold text-white shadow-[0_2px_8px_color-mix(in_srgb,var(--color-accent)_35%,transparent)]"
        aria-hidden="true"
      >
        S
      </div>

      <Link
        {...editorLink}
        title="Editor"
        aria-label="Editor"
        onClick={() => onNavigate?.()}
        className={cn('app-rail-btn titlebar-no-drag', onEditorPage && 'is-active')}
      >
        <FileText className="h-[18px] w-[18px]" />
      </Link>

      <Link
        to="/settings/appearance"
        title="Nastavenia"
        aria-label="Nastavenia"
        onClick={() => onNavigate?.()}
        className={cn('app-rail-btn titlebar-no-drag', onSettingsPage && 'is-active')}
      >
        <Settings2 className="h-[18px] w-[18px]" />
      </Link>
    </div>
  )
}
