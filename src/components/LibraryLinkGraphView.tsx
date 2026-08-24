import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Focus, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'
import {
  listLinkGraph,
  type LinkGraphEdge,
  type LinkGraphOrphan,
} from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId } from '@/store/documentsSlice'
import { Button } from '@/components/ui/button'

type GraphNode = {
  id: string
  title: string
  x: number
  y: number
  orphan: boolean
}

function neighborIds(edges: LinkGraphEdge[], centerId: string): Set<string> {
  const ids = new Set<string>([centerId])
  for (const edge of edges) {
    if (edge.sourceId === centerId) ids.add(edge.targetId)
    if (edge.targetId === centerId) ids.add(edge.sourceId)
  }
  return ids
}

function buildLayout(
  edges: LinkGraphEdge[],
  orphans: LinkGraphOrphan[],
  centerId: string | null,
  size: number,
  documentFallback: string,
  showOrphans: boolean,
  aroundActive: boolean,
  titleById: Map<string, string>,
): { nodes: GraphNode[]; nodeMap: Map<string, GraphNode>; visibleEdges: LinkGraphEdge[] } {
  const focusIds =
    aroundActive && centerId ? neighborIds(edges, centerId) : null

  const visibleEdges = focusIds
    ? edges.filter(
        (edge) => focusIds.has(edge.sourceId) && focusIds.has(edge.targetId),
      )
    : edges

  const ids = new Set<string>()
  const titles = new Map<string, string>(titleById)
  for (const edge of visibleEdges) {
    ids.add(edge.sourceId)
    ids.add(edge.targetId)
    titles.set(edge.sourceId, edge.sourceTitle)
    titles.set(edge.targetId, edge.targetTitle)
  }
  for (const orphan of orphans) {
    titles.set(orphan.id, orphan.title || documentFallback)
  }

  // Around + isolated active doc (e.g. orphan): still show the center node.
  if (aroundActive && centerId && !ids.has(centerId)) {
    ids.add(centerId)
  }

  const linkedIds = [...ids]
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.36
  const orphanIds = new Set(orphans.map((orphan) => orphan.id))

  const nodes: GraphNode[] = linkedIds.map((id, index) => {
    const angle = (index / Math.max(linkedIds.length, 1)) * Math.PI * 2 - Math.PI / 2
    const isLoneCenter = linkedIds.length === 1
    return {
      id,
      title: titles.get(id) ?? documentFallback,
      x: isLoneCenter ? cx : cx + Math.cos(angle) * radius,
      y: isLoneCenter ? cy : cy + Math.sin(angle) * radius,
      orphan: orphanIds.has(id) && !visibleEdges.some(
        (edge) => edge.sourceId === id || edge.targetId === id,
      ),
    }
  })

  if (centerId) {
    const center = nodes.find((node) => node.id === centerId)
    if (center && linkedIds.length > 1) {
      center.x = cx
      center.y = cy
    }
  }

  if (showOrphans) {
    const placed = new Set(nodes.map((node) => node.id))
    const visibleOrphans = orphans.filter((orphan) => {
      if (placed.has(orphan.id)) return false
      // Around mode: only the active orphan belongs in the focused neighborhood.
      if (aroundActive && centerId) return orphan.id === centerId
      return true
    })

    const orphanRadius = size * 0.46
    visibleOrphans.forEach((orphan, index) => {
      const alone = nodes.length === 0 && visibleOrphans.length === 1
      const angle =
        (index / Math.max(visibleOrphans.length, 1)) * Math.PI * 2 - Math.PI / 2
      nodes.push({
        id: orphan.id,
        title: orphan.title || documentFallback,
        x: alone ? cx : cx + Math.cos(angle) * orphanRadius,
        y: alone ? cy : cy + Math.sin(angle) * orphanRadius,
        orphan: true,
      })
    })
  }

  return { nodes, nodeMap: new Map(nodes.map((node) => [node.id, node])), visibleEdges }
}

export function LibraryLinkGraphView({
  initialAroundActive = false,
  onAroundActiveConsumed,
  variant = 'sidebar',
}: {
  initialAroundActive?: boolean
  onAroundActiveConsumed?: () => void
  variant?: 'sidebar' | 'page'
} = {}) {
  const isPage = variant === 'page'
  const [edges, setEdges] = useState<LinkGraphEdge[]>([])
  const [orphans, setOrphans] = useState<LinkGraphOrphan[]>([])
  const [loading, setLoading] = useState(true)
  const [showOrphans, setShowOrphans] = useState(false)
  const [aroundActive, setAroundActive] = useState(initialAroundActive)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  useEffect(() => {
    if (!initialAroundActive) return
    setAroundActive(true)
    onAroundActiveConsumed?.()
  }, [initialAroundActive, onAroundActiveConsumed])

  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const documents = useAppSelector((state) => state.documents.documents)
  const documentsVersion = useAppSelector((state) => {
    const docs = state.documents.documents
    const active = state.documents.activeDocument
    return `${docs.length}:${active?.id ?? ''}:${active?.updatedAt ?? 0}`
  })
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const titleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const doc of documents) {
      if (doc.deletedAt == null) map.set(doc.id, doc.title)
    }
    return map
  }, [documents])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void listLinkGraph()
      .then((result) => {
        if (cancelled) return
        setEdges(result.edges)
        setOrphans(result.orphans)
      })
      .catch(() => {
        if (cancelled) return
        setEdges([])
        setOrphans([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [documentsVersion])

  const size = isPage ? 720 : 320
  const labelMax = isPage ? 28 : 16
  const { nodes, nodeMap, visibleEdges } = useMemo(
    () =>
      buildLayout(
        edges,
        orphans,
        activeId,
        size,
        t('common.document'),
        showOrphans,
        aroundActive,
        titleById,
      ),
    [activeId, aroundActive, edges, orphans, showOrphans, size, t, titleById],
  )

  const openDocument = useCallback(
    (id: string) => {
      dispatch(setActiveDocumentId(id))
      void navigate(ROUTES.document(id))
    },
    [dispatch, navigate],
  )

  const resetView = useCallback(() => {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const zoomBy = useCallback((delta: number) => {
    setScale((current) => Math.min(3, Math.max(0.4, Number((current + delta).toFixed(2)))))
  }, [])

  function handleWheel(event: React.WheelEvent) {
    event.preventDefault()
    zoomBy(event.deltaY > 0 ? -0.1 : 0.1)
  }

  function handlePointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return
    const target = event.target as Element
    if (target.closest('[data-graph-node]')) return
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    setPan({
      x: drag.panX + (event.clientX - drag.x),
      y: drag.panY + (event.clientY - drag.y),
    })
  }

  function handlePointerUp(event: React.PointerEvent) {
    dragRef.current = null
    try {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }
  }

  const shellClass = isPage ? 'link-graph-page-body px-6 py-5 sm:px-8' : 'px-3 py-3'

  if (loading) {
    return (
      <p
        className={cn(
          'text-center text-[12px] text-[var(--color-muted-foreground)]',
          isPage ? 'px-6 py-16' : 'px-3 py-6',
        )}
      >
        {t('linkGraph.loading')}
      </p>
    )
  }

  const hasContent = edges.length > 0 || (showOrphans && orphans.length > 0)

  const toolbar = (
    <div className={cn('mb-2 flex flex-wrap items-center gap-1', isPage && 'mb-3 gap-1.5')}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7"
        title={t('linkGraph.zoomOut')}
        onClick={() => zoomBy(-0.15)}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7"
        title={t('linkGraph.zoomIn')}
        onClick={() => zoomBy(0.15)}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7"
        title={t('linkGraph.resetView')}
        onClick={resetView}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant={aroundActive ? 'default' : 'outline'}
        size="sm"
        className="h-7 gap-1 text-[11px]"
        disabled={!activeId}
        title={t('linkGraph.filterAround')}
        onClick={() => setAroundActive((value) => !value)}
      >
        <Focus className="h-3 w-3" />
        {t('linkGraph.filterAroundShort')}
      </Button>
      <Button
        type="button"
        variant={showOrphans ? 'default' : 'outline'}
        size="sm"
        className="h-7 text-[11px]"
        onClick={() => setShowOrphans((value) => !value)}
      >
        {t('linkGraph.showOrphans')}
      </Button>
      {!isPage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-[11px]"
          title={t('linkGraph.openFullMap')}
          onClick={() => void navigate(ROUTES.graph({ around: aroundActive }))}
        >
          <Maximize2 className="h-3 w-3" />
          {t('linkGraph.openFullMapShort')}
        </Button>
      )}
    </div>
  )

  if (!hasContent) {
    return (
      <div className={shellClass}>
        {toolbar}
        <p className={cn('text-center text-[12px] text-[var(--color-muted-foreground)]', isPage ? 'py-16' : 'py-4')}>
          {showOrphans && orphans.length === 0 ? t('linkGraph.emptyOrphans') : t('linkGraph.empty')}
        </p>
        {showOrphans && orphans.length > 0 ? null : orphans.length > 0 ? (
          <p className="text-center text-[11px] text-[var(--color-muted-foreground)]">
            {t('linkGraph.orphanHint', { count: orphans.length })}
          </p>
        ) : (
          <p className="mx-auto max-w-[42ch] text-center text-[12px] text-[var(--color-muted-foreground)]">
            {t('linkGraph.emptyHint')}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={shellClass}>
      {toolbar}

      <p className="mb-2 text-[11px] text-[var(--color-muted-foreground)]">
        {t('linkGraph.summary', {
          edges: visibleEdges.length,
          nodes: nodes.length,
        })}
        {showOrphans
          ? ` · ${t('linkGraph.orphanCount', {
              count: orphans.length,
            })}`
          : ''}
      </p>

      {nodes.length === 0 ? (
        <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-10 text-center text-[12px] text-[var(--color-muted-foreground)]">
          {aroundActive
            ? t('linkGraph.emptyAround')
            : showOrphans
              ? t('linkGraph.emptyOrphans')
              : t('linkGraph.empty')}
        </p>
      ) : (
        <div
          className={cn(
            'overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] touch-none',
            isPage && 'min-h-[min(70vh,720px)] shadow-[inset_0_1px_0_color-mix(in_srgb,#fff_6%,transparent)]',
          )}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className={cn('h-auto w-full select-none', isPage && 'min-h-[min(70vh,720px)]')}
          >
            <g transform={`translate(${pan.x / scale} ${pan.y / scale}) scale(${scale})`}>
              {visibleEdges.map((edge) => {
                const source = nodeMap.get(edge.sourceId)
                const target = nodeMap.get(edge.targetId)
                if (!source || !target) return null
                const isActive = activeId === edge.sourceId || activeId === edge.targetId
                return (
                  <line
                    key={`${edge.sourceId}-${edge.targetId}`}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={
                      isActive
                        ? 'color-mix(in srgb, var(--color-accent) 70%, transparent)'
                        : 'color-mix(in srgb, var(--color-border) 90%, transparent)'
                    }
                    strokeWidth={isActive ? (isPage ? 2.5 : 2) : isPage ? 1.5 : 1}
                  />
                )
              })}
              {nodes.map((node) => (
                <g
                  key={node.id}
                  data-graph-node=""
                  className="cursor-pointer"
                  onClick={() => openDocument(node.id)}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={
                      activeId === node.id
                        ? isPage
                          ? 14
                          : 10
                        : node.orphan
                          ? isPage
                            ? 8
                            : 5.5
                          : isPage
                            ? 10
                            : 7
                    }
                    className={cn(
                      activeId === node.id
                        ? 'fill-[var(--color-accent)]'
                        : node.orphan
                          ? 'fill-[color-mix(in_srgb,var(--color-muted-foreground)_35%,transparent)]'
                          : 'fill-[var(--color-surface-elevated)]',
                    )}
                    stroke="var(--color-border)"
                    strokeWidth={isPage ? 2 : 1.5}
                    strokeDasharray={node.orphan ? '2 2' : undefined}
                  />
                  <text
                    x={node.x}
                    y={node.y + (isPage ? 24 : 18)}
                    textAnchor="middle"
                    className={cn(
                      'fill-[var(--color-muted-foreground)]',
                      isPage ? 'text-[11px]' : 'text-[8px]',
                    )}
                  >
                    {node.title.length > labelMax
                      ? `${node.title.slice(0, labelMax - 1)}…`
                      : node.title}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        </div>
      )}
    </div>
  )
}
