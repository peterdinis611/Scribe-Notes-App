import { useMemo } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { closeActiveDocumentAndMaybeHome } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  closeOpenDocument,
  setActiveDocument,
  setActiveDocumentId,
} from '@/store/documentsSlice'

export function DocumentTabsBar() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const openIds = useAppSelector((state) => state.documents.openDocumentIds)
  const documents = useAppSelector((state) => state.documents.documents)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const focusMode = useAppSelector((state) => state.documents.focusMode)

  const onEditorRoute = pathname === '/' || pathname.startsWith('/doc/')

  const tabs = useMemo(() => {
    const byId = new Map(documents.map((doc) => [doc.id, doc]))
    return openIds
      .map((id) => {
        const doc = byId.get(id)
        if (!doc || doc.deletedAt != null) return null
        return { id, title: doc.title || t('common.untitled') }
      })
      .filter((tab): tab is { id: string; title: string } => tab != null)
  }, [documents, openIds, t])

  if (!onEditorRoute || focusMode || tabs.length === 0) return null

  function activate(id: string) {
    dispatch(setActiveDocumentId(id))
    const cached = peekCachedDocument(id)
    if (cached) dispatch(setActiveDocument(cached))
    void navigate(ROUTES.document(id))
  }

  function closeTab(id: string) {
    if (id === activeId) {
      closeActiveDocumentAndMaybeHome({
        activeId,
        openDocumentIds: openIds,
        dispatch,
        navigate,
      })
      return
    }

    // Closing a background tab — keep the current document.
    dispatch(closeOpenDocument(id))
  }

  return (
    <div
      className="document-tabs titlebar-no-drag flex shrink-0 items-stretch gap-0 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-rail)] px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [[data-sidebar-drawer=true]_&]:pl-[78px]"
      role="tablist"
      aria-label={t('tabs.ariaLabel')}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            className={cn(
              'group relative flex max-w-[200px] min-w-[96px] items-center gap-1 border-x border-t px-2.5 py-1.5 text-left transition-colors',
              isActive
                ? 'border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] shadow-[inset_0_2px_0_0_var(--color-accent)]'
                : 'border-transparent text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate border-none bg-transparent p-0 font-[family-name:var(--font-display)] text-[12px] font-semibold tracking-[-0.02em] text-inherit"
              onClick={() => activate(tab.id)}
              title={tab.title}
            >
              {tab.title}
            </button>
            <button
              type="button"
              className={cn(
                'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border-none bg-transparent text-[var(--color-muted-foreground)] transition-opacity hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
                isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100',
              )}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                closeTab(tab.id)
              }}
              title={t('tabs.close')}
              aria-label={t('tabs.close')}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
