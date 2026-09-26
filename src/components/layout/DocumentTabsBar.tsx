import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDrag, useDrop } from 'react-dnd'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Pin, X } from 'lucide-react'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { prefetchDocument } from '@/lib/cache/prefetch-document'
import { TAB_DND_TYPE, type TabDragItem } from '@/lib/dnd/types'
import { closeActiveDocumentAndMaybeHome } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { IconTooltip } from '@/components/ui/tooltip'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  closeOpenDocument,
  reorderOpenDocuments,
  setActiveDocument,
  setActiveDocumentId,
  togglePinnedDocument,
} from '@/store/documentsSlice'

export function DocumentTabsBar() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const openIds = useAppSelector((state) => state.documents.openDocumentIds)
  const pinnedIds = useAppSelector((state) => state.documents.pinnedDocumentIds)
  const documents = useAppSelector((state) => state.documents.documents)
  const dirtyDocumentIds = useAppSelector((state) => state.documents.dirtyDocumentIds)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollHints, setScrollHints] = useState({ left: false, right: false })

  const onEditorRoute = pathname === '/' || pathname.startsWith('/doc/')
  const dirtySet = useMemo(() => new Set(dirtyDocumentIds), [dirtyDocumentIds])

  const tabs = useMemo(() => {
    const byId = new Map(documents.map((doc) => [doc.id, doc]))
    const pinnedSet = new Set(pinnedIds)
    const mapped = openIds
      .map((id) => {
        const doc = byId.get(id)
        if (!doc || doc.deletedAt != null) return null
        return {
          id,
          title: doc.title || t('common.untitled'),
          pinned: pinnedSet.has(id),
          dirty: dirtySet.has(id),
        }
      })
      .filter((tab): tab is { id: string; title: string; pinned: boolean; dirty: boolean } => tab != null)

    return [
      ...mapped.filter((tab) => tab.pinned),
      ...mapped.filter((tab) => !tab.pinned),
    ]
  }, [dirtySet, documents, openIds, pinnedIds, t])

  const updateScrollHints = useCallback(() => {
    const el = listRef.current
    if (!el) return
    setScrollHints({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    })
  }, [])

  useEffect(() => {
    updateScrollHints()
  }, [tabs, updateScrollHints])

  useEffect(() => {
    const el = listRef.current
    if (!el) return

    el.addEventListener('scroll', updateScrollHints, { passive: true })
    const observer = new ResizeObserver(updateScrollHints)
    observer.observe(el)

    return () => {
      el.removeEventListener('scroll', updateScrollHints)
      observer.disconnect()
    }
  }, [updateScrollHints])

  useEffect(() => {
    if (!activeId) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`)
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeId, tabs])

  if (!onEditorRoute || focusMode || tabs.length === 0) return null

  function activate(id: string) {
    dispatch(setActiveDocumentId(id))
    const cached = peekCachedDocument(id)
    if (cached) dispatch(setActiveDocument(cached))
    else prefetchDocument(id)
    void navigate(ROUTES.document(id))
  }

  function closeTab(id: string) {
    if (pinnedIds.includes(id)) return

    if (id === activeId) {
      closeActiveDocumentAndMaybeHome({
        activeId,
        openDocumentIds: openIds,
        pinnedDocumentIds: pinnedIds,
        dispatch,
        navigate,
      })
      return
    }

    dispatch(closeOpenDocument(id))
  }

  return (
    <div
      className={cn(
        'document-tabs-shell',
        scrollHints.left && 'can-scroll-left',
        scrollHints.right && 'can-scroll-right',
      )}
      data-tour="document-tabs"
    >
      <div
        ref={listRef}
        className="document-tabs titlebar-no-drag flex shrink-0 flex-nowrap items-stretch gap-0 overflow-x-auto overscroll-x-contain border-b border-[var(--color-border)] bg-[var(--color-rail)] px-2 [[data-sidebar-drawer=true]_&]:pl-[78px]"
        role="tablist"
        aria-label={t('tabs.ariaLabel')}
      >
        {tabs.map((tab) => (
          <DocumentTab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeId}
            onActivate={activate}
            onClose={closeTab}
          />
        ))}
      </div>
    </div>
  )
}

function DocumentTab({
  tab,
  isActive,
  onActivate,
  onClose,
}: {
  tab: { id: string; title: string; pinned: boolean; dirty: boolean }
  isActive: boolean
  onActivate: (id: string) => void
  onClose: (id: string) => void
}) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const tabRef = useRef<HTMLDivElement>(null)

  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: TAB_DND_TYPE,
      item: { id: tab.id, pinned: tab.pinned } satisfies TabDragItem,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [tab.id, tab.pinned],
  )

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: TAB_DND_TYPE,
      canDrop: (item: TabDragItem) => item.pinned === tab.pinned && item.id !== tab.id,
      hover: (item: TabDragItem) => {
        if (item.pinned !== tab.pinned || item.id === tab.id) return
        dispatch(reorderOpenDocuments({ fromId: item.id, toId: tab.id }))
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }) && monitor.canDrop(),
      }),
    }),
    [dispatch, tab.id, tab.pinned],
  )

  drag(drop(tabRef))

  return (
    <div
      ref={tabRef}
      data-tab-id={tab.id}
      role="tab"
      aria-selected={isActive}
      aria-roledescription={t('tabs.reorder')}
      title={tab.dirty ? `${tab.title} • ${t('tabs.unsaved')}` : tab.title}
      className={cn(
        'group relative flex max-w-[200px] min-w-[96px] shrink-0 items-center gap-1 border-x border-t px-2.5 py-1.5 text-left transition-colors',
        isActive
          ? 'border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] shadow-[inset_0_2px_0_0_var(--color-accent)]'
          : 'border-transparent text-[var(--color-muted-foreground)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
        isDragging && 'is-dragging',
        isOver && 'is-drop-target',
      )}
    >
      <IconTooltip label={tab.pinned ? t('tabs.unpin') : t('tabs.pin')}>
        <button
          type="button"
          className={cn(
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border-none bg-transparent transition-opacity hover:bg-[var(--color-hover)]',
            tab.pinned
              ? 'text-[var(--color-accent)] opacity-100'
              : 'text-[var(--color-muted-foreground)] opacity-0 group-hover:opacity-100',
          )}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            dispatch(togglePinnedDocument(tab.id))
          }}
          aria-label={tab.pinned ? t('tabs.unpin') : t('tabs.pin')}
        >
          <Pin className={cn('h-3 w-3', tab.pinned && 'fill-current')} />
        </button>
      </IconTooltip>
      <button
        type="button"
        className="min-w-0 flex-1 truncate border-none bg-transparent p-0 font-[family-name:var(--font-display)] text-[12px] font-semibold tracking-[-0.02em] text-inherit"
        onClick={() => onActivate(tab.id)}
        onPointerEnter={() => prefetchDocument(tab.id)}
        title={tab.title}
      >
        {tab.dirty ? (
          <span className="document-tab-dirty" aria-hidden>
            ●
          </span>
        ) : null}
        {tab.title}
      </button>
      {!tab.pinned && (
        <IconTooltip label={t('tabs.close')}>
          <button
            type="button"
            className={cn(
              'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border-none bg-transparent text-[var(--color-muted-foreground)] transition-opacity hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
              isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100',
            )}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onClose(tab.id)
            }}
            aria-label={t('tabs.close')}
          >
            <X className="h-3 w-3" />
          </button>
        </IconTooltip>
      )}
    </div>
  )
}
