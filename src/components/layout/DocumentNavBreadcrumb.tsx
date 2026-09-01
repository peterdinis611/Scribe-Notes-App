import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { goToHome, navigateToBreadcrumb, navigateWikiBack } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'

export function DocumentNavBreadcrumb() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const documents = useAppSelector((state) => state.documents.documents)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const documentNavStack = useAppSelector((state) => state.documents.documentNavStack)
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)

  if (!activeId || documentNavStack.length === 0) return null

  const canGoBack = documentNavStack.length > 0
  const titleById = new Map(documents.map((doc) => [doc.id, doc.title]))

  function resolveTitle(id: string) {
    if (id === activeId && activeDocument?.title) return activeDocument.title
    return titleById.get(id) || t('common.untitled')
  }

  return (
    <div className="document-nav-breadcrumb titlebar-no-drag flex min-w-0 items-center gap-1">
      {canGoBack && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2"
          title={t('wikiNav.backHint')}
          onClick={() =>
            navigateWikiBack({
              documentNavStack,
              dispatch,
              navigate: (route) => void navigate(route),
            })
          }
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="[[data-layout-tier=tight]_&]:hidden">{t('wikiNav.back')}</span>
        </Button>
      )}

      <nav
        className="flex min-w-0 items-center gap-0.5 text-[11px] text-[var(--color-muted-foreground)]"
        aria-label={t('wikiNav.breadcrumbLabel')}
      >
        <button
          type="button"
          className="document-nav-crumb shrink-0"
          onClick={() => goToHome({ dispatch, navigate: (route) => void navigate(route) })}
        >
          {t('nav.library')}
        </button>

        {documentNavStack.map((id) => (
          <span key={id} className="inline-flex min-w-0 items-center gap-0.5">
            <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
            <button
              type="button"
              className={cn('document-nav-crumb min-w-0 truncate')}
              title={resolveTitle(id)}
              onClick={() =>
                navigateToBreadcrumb({
                  targetId: id,
                  dispatch,
                  navigate: (route) => void navigate(route),
                })
              }
            >
              {resolveTitle(id)}
            </button>
          </span>
        ))}

        {documentNavStack.length > 0 && (
          <>
            <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-[0.06em] opacity-70">{t('wikiNav.trail')}</span>
          </>
        )}
      </nav>
    </div>
  )
}
