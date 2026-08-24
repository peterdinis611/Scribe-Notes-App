import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Focus, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'
import {
  listLinkGraph,
  type LinkGraphEdge,
  type LinkGraphOrphan,
} from '@/lib/db/api'
import {
  createForceSimulation,
  degreeById,
  type ForceNode,
} from '@/lib/link-graph/force-layout'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId } from '@/store/documentsSlice'
import { Button } from '@/components/ui/button'

function neighborIds(edges: LinkGraphEdge[], centerId: string): Set<string> {
  const ids = new Set<string>([centerId])
  for (const edge of edges) {
    if (edge.sourceId === centerId) ids.add(edge.targetId)
    if (edge.targetId === centerId) ids.add(edge.sourceId)
  }
  return ids
}

function collectVisible(
  edges: LinkGraphEdge[],
  orphans: LinkGraphOrphan[],
  centerId: string | null,
  showOrphans: boolean,
  aroundActive: boolean,
  titleById: Map<string, string>,
  documentFallback: string,
): {
  nodes: Array<{ id: string; title: string; orphan: boolean; degree: number }>
  visibleEdges: LinkGraphEdge[]
} {
  const focusIds = aroundActive && centerId ? neighborIds(edges, centerId) : null
  const visibleEdges = focusIds
    ? edges.filter((edge) => focusIds.has(edge.sourceId) && focusIds.has(edge.targetId))
    : edges

  const degrees = degreeById(
    visibleEdges.map((edge) => ({ sourceId: edge.sourceId, targetId: edge.targetId })),
  )
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
  if (aroundActive && centerId && !ids.has(centerId)) ids.add(centerId)

  const orphanIds = new Set(orphans.map((orphan) => orphan.id))
  const nodes: Array<{ id: string; title: string; orphan: boolean; degree: number }> = [
    ...ids,
  ].map((id) => ({
    id,
    title: titles.get(id) ?? documentFallback,
    orphan:
      orphanIds.has(id) &&
      !visibleEdges.some((edge) => edge.sourceId === id || edge.targetId === id),
    degree: degrees.get(id) ?? 0,
  }))

  if (showOrphans) {
    const placed = new Set(nodes.map((node) => node.id))
    for (const orphan of orphans) {
      if (placed.has(orphan.id)) continue
      if (aroundActive && centerId && orphan.id !== centerId) continue
      nodes.push({
        id: orphan.id,
        title: orphan.title || documentFallback,
        orphan: true,
        degree: 0,
      })
    }
  }

  return { nodes, visibleEdges }
}

function nodeRadius(node: ForceNode, isPage: boolean, isActive: boolean): number {
  const base = isPage ? 7 : 5.5
  const byDegree = Math.min(isPage ? 10 : 7, node.degree * (isPage ? 1.6 : 1.2))
  const orphanShrink = node.orphan ? 0.72 : 1
  const activeBoost = isActive ? (isPage ? 4 : 3) : 0
  return (base + byDegree) * orphanShrink + activeBoost
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
  const [tick, setTick] = useState(0)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const simRef = useRef<ReturnType<typeof createForceSimulation> | null>(null)
  const panDragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const nodeDragRef = useRef<{
    id: string
    pointerId: number
    moved: boolean
  } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

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

  const size = isPage ? 900 : 320
  const labelMax = isPage ? 26 : 14

  const { nodes: seedNodes, visibleEdges } = useMemo(
    () =>
      collectVisible(
        edges,
        orphans,
        activeId,
        showOrphans,
        aroundActive,
        titleById,
        t('common.document'),
      ),
    [activeId, aroundActive, edges, orphans, showOrphans, t, titleById],
  )

  const graphKey = useMemo(
    () =>
      `${size}:${aroundActive}:${showOrphans}:${seedNodes.map((node) => node.id).join(',')}:${visibleEdges.length}`,
    [aroundActive, seedNodes, showOrphans, size, visibleEdges.length],
  )

  useEffect(() => {
    if (seedNodes.length === 0) {
      simRef.current = null
      setTick((value) => value + 1)
      return
    }

    const sim = createForceSimulation(seedNodes, visibleEdges, {
      width: size,
      height: size,
      tight: aroundActive,
    })
    simRef.current = sim

    let frame = 0
    let running = true
    const loop = () => {
      if (!running || !simRef.current) return
      const keepGoing = simRef.current.step()
      setTick((value) => value + 1)
      if (keepGoing) frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    return () => {
      running = false
      cancelAnimationFrame(frame)
    }
  }, [graphKey]) // eslint-disable-line react-hooks/exhaustive-deps -- restart only when topology changes

  const simNodes = simRef.current?.nodes ?? []
  const nodeMap = useMemo(() => new Map(simNodes.map((node) => [node.id, node])), [simNodes, tick])

  const hoverNeighbors = useMemo(() => {
    if (!hoveredId) return null
    const ids = new Set<string>([hoveredId])
    for (const edge of visibleEdges) {
      if (edge.sourceId === hoveredId) ids.add(edge.targetId)
      if (edge.targetId === hoveredId) ids.add(edge.sourceId)
    }
    return ids
  }, [hoveredId, visibleEdges])

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
    simRef.current?.reheat(0.55)
  }, [])

  const zoomBy = useCallback((delta: number) => {
    setScale((current) => Math.min(3.2, Math.max(0.35, Number((current + delta).toFixed(2)))))
  }, [])

  function clientToGraph(clientX: number, clientY: number) {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const viewX = ((clientX - rect.left) / rect.width) * size
    const viewY = ((clientY - rect.top) / rect.height) * size
    return {
      x: (viewX - pan.x / scale) / scale,
      y: (viewY - pan.y / scale) / scale,
    }
  }

  function handleWheel(event: React.WheelEvent) {
    event.preventDefault()
    zoomBy(event.deltaY > 0 ? -0.1 : 0.1)
  }

  function handlePointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return
    const target = event.target as Element
    const nodeEl = target.closest('[data-graph-node]') as HTMLElement | null
    if (nodeEl?.dataset.nodeId) {
      const id = nodeEl.dataset.nodeId
      const node = simRef.current?.nodeById.get(id)
      if (!node) return
      node.fixed = true
      nodeDragRef.current = { id, pointerId: event.pointerId, moved: false }
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      event.stopPropagation()
      return
    }

    panDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent) {
    const nodeDrag = nodeDragRef.current
    if (nodeDrag && simRef.current) {
      const node = simRef.current.nodeById.get(nodeDrag.id)
      if (node) {
        const point = clientToGraph(event.clientX, event.clientY)
        node.x = point.x
        node.y = point.y
        node.vx = 0
        node.vy = 0
        nodeDrag.moved = true
        simRef.current.reheat(0.2)
        setTick((value) => value + 1)
      }
      return
    }

    const drag = panDragRef.current
    if (!drag) return
    setPan({
      x: drag.panX + (event.clientX - drag.x),
      y: drag.panY + (event.clientY - drag.y),
    })
  }

  function handlePointerUp(event: React.PointerEvent) {
    const nodeDrag = nodeDragRef.current
    if (nodeDrag && simRef.current) {
      const node = simRef.current.nodeById.get(nodeDrag.id)
      if (node) node.fixed = false
      if (!nodeDrag.moved) openDocument(nodeDrag.id)
      nodeDragRef.current = null
      simRef.current.reheat(0.25)
    }
    panDragRef.current = null
    try {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }
  }

  const shellClass = isPage ? 'link-graph-page-body' : 'px-3 py-3'
  const hasContent = edges.length > 0 || (showOrphans && orphans.length > 0)

  const toolbar = (
    <div
      className={cn(
        'link-graph-toolbar flex flex-wrap items-center gap-1',
        isPage ? 'link-graph-toolbar--overlay' : 'mb-2',
        isPage && 'mb-0 gap-1.5',
      )}
    >
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

  if (!hasContent) {
    return (
      <div className={cn(shellClass, isPage && 'px-6 py-5 sm:px-8')}>
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
    <div className={cn(shellClass, isPage && 'relative flex min-h-0 flex-1 flex-col')}>
      {toolbar}

      {!isPage && (
        <p className="mb-2 text-[11px] text-[var(--color-muted-foreground)]">
          {t('linkGraph.summary', {
            edges: visibleEdges.length,
            nodes: seedNodes.length,
          })}
          {showOrphans
            ? ` · ${t('linkGraph.orphanCount', {
                count: orphans.length,
              })}`
            : ''}
        </p>
      )}

      {seedNodes.length === 0 ? (
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
            'link-graph-canvas touch-none overflow-hidden',
            isPage ? 'link-graph-canvas--page min-h-0 flex-1' : 'rounded-xl border border-[var(--color-border)]',
          )}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {isPage && (
            <p className="link-graph-canvas-meta">
              {t('linkGraph.summary', {
                edges: visibleEdges.length,
                nodes: seedNodes.length,
              })}
              {showOrphans
                ? ` · ${t('linkGraph.orphanCount', { count: orphans.length })}`
                : ''}
              {' · '}
              {t('linkGraph.obsidianHint')}
            </p>
          )}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${size} ${size}`}
            className={cn('link-graph-svg h-auto w-full select-none', isPage && 'h-full min-h-[min(78vh,900px)]')}
          >
            <defs>
              <radialGradient id="link-graph-void" cx="50%" cy="45%" r="65%">
                <stop offset="0%" stopColor="var(--link-graph-void-center)" />
                <stop offset="100%" stopColor="var(--link-graph-void-edge)" />
              </radialGradient>
            </defs>
            <rect width={size} height={size} fill="url(#link-graph-void)" />
            <g transform={`translate(${pan.x / scale} ${pan.y / scale}) scale(${scale})`}>
              {visibleEdges.map((edge) => {
                const source = nodeMap.get(edge.sourceId)
                const target = nodeMap.get(edge.targetId)
                if (!source || !target) return null
                const relatedToActive =
                  activeId === edge.sourceId || activeId === edge.targetId
                const relatedToHover =
                  !hoverNeighbors ||
                  (hoverNeighbors.has(edge.sourceId) && hoverNeighbors.has(edge.targetId))
                const dimmed = Boolean(hoverNeighbors && !relatedToHover)
                return (
                  <line
                    key={`${edge.sourceId}-${edge.targetId}`}
                    className={cn(
                      'link-graph-edge',
                      relatedToActive && 'is-active',
                      relatedToHover && hoveredId && 'is-hot',
                      dimmed && 'is-dim',
                    )}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                  />
                )
              })}
              {simNodes.map((node) => {
                const isActive = activeId === node.id
                const isHovered = hoveredId === node.id
                const related =
                  !hoverNeighbors || hoverNeighbors.has(node.id)
                const dimmed = Boolean(hoverNeighbors && !related)
                const showLabel =
                  isPage || isActive || isHovered || Boolean(hoverNeighbors?.has(node.id))
                const r = nodeRadius(node, isPage, isActive)
                const label =
                  node.title.length > labelMax
                    ? `${node.title.slice(0, labelMax - 1)}…`
                    : node.title

                return (
                  <g
                    key={node.id}
                    data-graph-node=""
                    data-node-id={node.id}
                    className={cn(
                      'link-graph-node',
                      isActive && 'is-active',
                      node.orphan && 'is-orphan',
                      isHovered && 'is-hovered',
                      dimmed && 'is-dim',
                    )}
                    onPointerEnter={() => setHoveredId(node.id)}
                    onPointerLeave={() =>
                      setHoveredId((current) => (current === node.id ? null : current))
                    }
                  >
                    {(isActive || isHovered) && (
                      <circle
                        className="link-graph-node-glow"
                        cx={node.x}
                        cy={node.y}
                        r={r + (isPage ? 10 : 7)}
                      />
                    )}
                    <circle className="link-graph-node-core" cx={node.x} cy={node.y} r={r} />
                    {showLabel && (
                      <text
                        className="link-graph-node-label"
                        x={node.x}
                        y={node.y + r + (isPage ? 14 : 11)}
                        textAnchor="middle"
                      >
                        {label}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
      )}
    </div>
  )
}
