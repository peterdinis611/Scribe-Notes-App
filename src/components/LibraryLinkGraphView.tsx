import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { listLinkGraph, type LinkGraphEdge } from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId } from '@/store/documentsSlice'
import { useEffect, useState } from 'react'

type GraphNode = {
  id: string
  title: string
  x: number
  y: number
}

function buildLayout(edges: LinkGraphEdge[], centerId: string | null, size: number) {
  const ids = new Set<string>()
  const titles = new Map<string, string>()
  for (const edge of edges) {
    ids.add(edge.sourceId)
    ids.add(edge.targetId)
    titles.set(edge.sourceId, edge.sourceTitle)
    titles.set(edge.targetId, edge.targetTitle)
  }

  const nodeIds = [...ids]
  const radius = size * 0.36
  const cx = size / 2
  const cy = size / 2

  const nodes: GraphNode[] = nodeIds.map((id, index) => {
    const angle = (index / Math.max(nodeIds.length, 1)) * Math.PI * 2 - Math.PI / 2
    return {
      id,
      title: titles.get(id) ?? 'Dokument',
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    }
  })

  if (centerId) {
    const center = nodes.find((node) => node.id === centerId)
    if (center) {
      center.x = cx
      center.y = cy
    }
  }

  return { nodes, nodeMap: new Map(nodes.map((node) => [node.id, node])) }
}

export function LibraryLinkGraphView() {
  const [edges, setEdges] = useState<LinkGraphEdge[]>([])
  const [loading, setLoading] = useState(true)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { t } = useTranslation()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void listLinkGraph()
      .then((result) => {
        if (!cancelled) setEdges(result)
      })
      .catch(() => {
        if (!cancelled) setEdges([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const size = 320
  const { nodes, nodeMap } = useMemo(
    () => buildLayout(edges, activeId, size),
    [activeId, edges],
  )

  function openDocument(id: string) {
    dispatch(setActiveDocumentId(id))
    void navigate(ROUTES.document(id))
  }

  if (loading) {
    return (
      <p className="px-3 py-6 text-center text-[12px] text-[var(--color-muted-foreground)]">
        {t('linkGraph.loading')}
      </p>
    )
  }

  if (edges.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-[12px] text-[var(--color-muted-foreground)]">
        {t('linkGraph.empty')}
      </p>
    )
  }

  return (
    <div className="px-3 py-3">
      <p className="mb-2 text-[11px] text-[var(--color-muted-foreground)]">
        {t('linkGraph.summary', { edges: edges.length, nodes: nodes.length })}
      </p>
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)]">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full">
          {edges.map((edge) => {
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
                strokeWidth={isActive ? 2 : 1}
              />
            )
          })}
          {nodes.map((node) => (
            <g
              key={node.id}
              className="cursor-pointer"
              onClick={() => openDocument(node.id)}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={activeId === node.id ? 10 : 7}
                className={cn(
                  activeId === node.id
                    ? 'fill-[var(--color-accent)]'
                    : 'fill-[var(--color-surface-elevated)]',
                )}
                stroke="var(--color-border)"
                strokeWidth={1.5}
              />
              <text
                x={node.x}
                y={node.y + 18}
                textAnchor="middle"
                className="fill-[var(--color-muted-foreground)] text-[8px]"
              >
                {node.title.length > 16 ? `${node.title.slice(0, 15)}…` : node.title}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
