import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useDrag, useDrop } from 'react-dnd'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Pin, X } from 'lucide-react'
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

  const scrollByAmount = useCallback((direction: -1 | 1) => {
    const el = listRef.current
    if (!el) return
    el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.45), behavior: 'smooth' })
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

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      if (el.scrollWidth <= el.clientWidth) return
      event.preventDefault()
      el.scrollLeft += event.deltaY
      updateScrollHints()
    }
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      el.removeEventListener('scroll', updateScrollHints)
      el.removeEventListener('wheel', onWheel)
      observer.disconnect()
    }
  }, [updateScrollHints])

  useEffect(() => {
    if (!activeId) return
    const frame = window.requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`)
        ?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeId, tabs])

  if (!onEditorRoute || focusMode || tabs.length === 0) return null

  function activate(id: string) {
    dispatch(setActiveDocumentId(id))
    const cached = peekCachedDocument(id)
    if (cached) dispatch(setActiveDocument(cached))
    else prefetchDocument(id, 'high')
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

  const overflow = scrollHints.left || scrollHints.right

  return (
    <div
      className={cn(
        'document-tabs-shell',
        scrollHints.left && 'can-scroll-left',
        scrollHints.right && 'can-scroll-right',
        overflow && 'is-overflowing',
      )}
      data-tour="document-tabs"
    >
      {overflow ? (
        <button
          type="button"
          className={cn('document-tabs-scroll-btn is-left', !scrollHints.left && 'is-disabled')}
          onClick={() => scrollByAmount(-1)}
          disabled={!scrollHints.left}
          aria-label={t('tabs.scrollLeft')}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      ) : null}

      <div
        ref={listRef}
        className="document-tabs titlebar-no-drag"
        role="tablist"
        aria-label={t('tabs.ariaLabel')}
      >
        {tabs.map((tab, index) => (
          <DocumentTab
            key={tab.id}
            tab={tab}
            index={index}
            isActive={tab.id === activeId}
            onActivate={activate}
            onClose={closeTab}
          />
        ))}
      </div>

      {overflow ? (
        <button
          type="button"
          className={cn('document-tabs-scroll-btn is-right', !scrollHints.right && 'is-disabled')}
          onClick={() => scrollByAmount(1)}
          disabled={!scrollHints.right}
          aria-label={t('tabs.scrollRight')}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

function DocumentTab({
  tab,
  index,
  isActive,
  onActivate,
  onClose,
}: {
  tab: { id: string; title: string; pinned: boolean; dirty: boolean }
  index: number
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
      style={{ '--tab-reveal': String(Math.min(index, 8)) } as CSSProperties}
      className={cn(
        'document-tab group',
        isActive && 'is-active',
        tab.pinned && 'is-pinned',
        tab.dirty && 'is-dirty',
        isDragging && 'is-dragging',
        isOver && 'is-drop-target',
      )}
    >
      <IconTooltip label={tab.pinned ? t('tabs.unpin') : t('tabs.pin')}>
        <button
          type="button"
          className={cn('document-tab-pin', tab.pinned && 'is-on')}
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
        className="document-tab-label"
        onClick={() => onActivate(tab.id)}
        onPointerEnter={() => prefetchDocument(tab.id, 'low')}
        title={tab.title}
      >
        {tab.dirty ? <span className="document-tab-dirty" aria-hidden /> : null}
        <span className="document-tab-title">{tab.title}</span>
      </button>

      {!tab.pinned ? (
        <IconTooltip label={t('tabs.close')}>
          <button
            type="button"
            className="document-tab-close"
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
      ) : null}
    </div>
  )
}
