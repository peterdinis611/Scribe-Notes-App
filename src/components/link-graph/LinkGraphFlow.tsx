import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  type Edge,
  type NodeTypes,
} from '@xyflow/react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@xyflow/react/dist/style.css'
import type { LinkGraphEdge } from '@/lib/db/api'
import {
  createForceSimulation,
  type ForceNodeKind,
} from '@/lib/link-graph/force-layout'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { IconTooltip } from '@/components/ui/tooltip'
import {
  LINK_GRAPH_NODE_TYPE,
  LinkGraphNode,
  type LinkGraphFlowNode,
  type LinkGraphNodeData,
} from '@/components/link-graph/LinkGraphNode'

export type LinkGraphSeed = {
  id: string
  title: string
  orphan: boolean
  degree: number
  color?: string
  kind?: ForceNodeKind
}

type LinkGraphFlowProps = {
  seeds: LinkGraphSeed[]
  edges: LinkGraphEdge[]
  activeId: string | null
  graphCenterId: string | null
  isPage?: boolean
  aroundActive?: boolean
  className?: string
  onOpenDocument: (id: string) => void
  onActivateTag: (tagNodeId: string, title: string) => void
  onFocusEntity: (entityNodeId: string) => void
  onFocusDocument: (id: string) => void
}

const nodeTypes: NodeTypes = {
  [LINK_GRAPH_NODE_TYPE]: LinkGraphNode,
}

function isSynthetic(id: string) {
  return id.startsWith('tag:') || id.startsWith('entity:')
}

function layoutSeeds(
  seeds: LinkGraphSeed[],
  edges: LinkGraphEdge[],
  size: number,
  tight: boolean,
): LinkGraphFlowNode[] {
  if (seeds.length === 0) return []
  const sim = createForceSimulation(
    seeds.map((seed) => ({
      id: seed.id,
      title: seed.title,
      orphan: seed.orphan,
      degree: seed.degree,
      color: seed.color,
      kind: seed.kind ?? 'document',
    })),
    edges.map((edge) => ({ sourceId: edge.sourceId, targetId: edge.targetId })),
    { width: size, height: size, tight },
  )

  let guard = 0
  while (sim.step() && guard < 500) guard += 1

  return sim.nodes.map((node) => {
    const kind = node.kind ?? 'document'
    const r =
      kind === 'tag'
        ? 10
        : kind === 'entity'
          ? 8
          : Math.min(22, 8 + node.degree * 1.4)
    const box = Math.max(36, Math.round(r * 2 + 16))
    return {
      id: node.id,
      type: LINK_GRAPH_NODE_TYPE,
      position: { x: node.x - box / 2, y: node.y - box / 2 },
      data: {
        title: node.title,
        orphan: node.orphan,
        degree: node.degree,
        color: node.color,
        kind,
        active: false,
        dimmed: false,
        hovered: false,
        isPage: false,
      } satisfies LinkGraphNodeData,
      draggable: true,
      selectable: true,
    } satisfies LinkGraphFlowNode
  })
}

function toFlowEdges(edges: LinkGraphEdge[], activeId: string | null): Edge[] {
  return edges.map((edge) => {
    const related = activeId === edge.sourceId || activeId === edge.targetId
    return {
      id: `${edge.sourceId}->${edge.targetId}`,
      source: edge.sourceId,
      target: edge.targetId,
      type: 'default',
      animated: related,
      className: cn('link-graph-rf-edge', related && 'is-active'),
      style: {
        stroke: related
          ? 'var(--link-graph-edge-hot)'
          : 'var(--link-graph-edge)',
        strokeWidth: related ? 1.6 : 1.1,
      },
    }
  })
}

function LinkGraphZoomPanel() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const zoom = useStore((state) => state.transform[2])
  const { t } = useTranslation()
  const percent = Math.round(zoom * 100)

  return (
    <Panel position="bottom-left" className="link-graph-rf-zoom">
      <IconTooltip label={t('linkGraph.zoomOut')}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t('linkGraph.zoomOut')}
          onClick={() => void zoomOut({ duration: 160 })}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
      </IconTooltip>
      <IconTooltip label={t('linkGraph.fitView')}>
        <button
          type="button"
          className="link-graph-rf-zoom-readout"
          aria-label={t('linkGraph.fitView')}
          onClick={() => void fitView({ padding: 0.2, duration: 220 })}
        >
          {percent}%
        </button>
      </IconTooltip>
      <IconTooltip label={t('linkGraph.zoomIn')}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t('linkGraph.zoomIn')}
          onClick={() => void zoomIn({ duration: 160 })}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </IconTooltip>
      <IconTooltip label={t('linkGraph.fitView')}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t('linkGraph.fitView')}
          onClick={() => void fitView({ padding: 0.2, duration: 220 })}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </IconTooltip>
    </Panel>
  )
}

function LinkGraphFlowInner({
  seeds,
  edges,
  activeId,
  graphCenterId,
  isPage = false,
  aroundActive = false,
  className,
  onOpenDocument,
  onActivateTag,
  onFocusEntity,
  onFocusDocument,
}: LinkGraphFlowProps) {
  const size = isPage ? 900 : 360
  const { fitView } = useReactFlow()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const clickTimerRef = useRef<number | null>(null)
  const topologyKey = useMemo(
    () =>
      `${size}:${aroundActive}:${seeds.map((s) => s.id).join(',')}:${edges.length}`,
    [aroundActive, edges.length, seeds, size],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<LinkGraphFlowNode>([])
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    const laidOut = layoutSeeds(seeds, edges, size, aroundActive).map((node) => ({
      ...node,
      data: { ...node.data, isPage },
    }))
    setNodes(laidOut)
    setFlowEdges(toFlowEdges(edges, activeId))
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: isPage ? 0.18 : 0.22, duration: 280 })
    })
    return () => cancelAnimationFrame(frame)
    // Topology / viewport size only — active/hover patched separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologyKey])

  useEffect(() => {
    setFlowEdges(toFlowEdges(edges, activeId))
  }, [activeId, edges, setFlowEdges])

  useEffect(() => {
    const neighbors = hoveredId
      ? (() => {
          const ids = new Set<string>([hoveredId])
          for (const edge of edges) {
            if (edge.sourceId === hoveredId) ids.add(edge.targetId)
            if (edge.targetId === hoveredId) ids.add(edge.sourceId)
          }
          return ids
        })()
      : null

    setNodes((current) =>
      current.map((node) => {
        const active =
          activeId === node.id ||
          (isSynthetic(node.id) && graphCenterId === node.id) ||
          graphCenterId === node.id
        const hovered = hoveredId === node.id
        const dimmed = Boolean(neighbors && !neighbors.has(node.id))
        if (
          node.data.active === active &&
          node.data.hovered === hovered &&
          node.data.dimmed === dimmed &&
          node.data.isPage === isPage
        ) {
          return node
        }
        return {
          ...node,
          data: {
            ...node.data,
            active,
            hovered,
            dimmed,
            isPage,
          },
        }
      }),
    )

    setFlowEdges((current) =>
      current.map((edge) => {
        const relatedToHover =
          !neighbors ||
          (neighbors.has(edge.source) && neighbors.has(edge.target))
        const dimmed = Boolean(neighbors && !relatedToHover)
        const relatedToActive =
          activeId === edge.source || activeId === edge.target
        return {
          ...edge,
          animated: relatedToActive || (Boolean(hoveredId) && relatedToHover),
          className: cn(
            'link-graph-rf-edge',
            relatedToActive && 'is-active',
            relatedToHover && hoveredId && 'is-hot',
            dimmed && 'is-dim',
          ),
          style: {
            stroke: relatedToActive || (hoveredId && relatedToHover)
              ? 'var(--link-graph-edge-hot)'
              : 'var(--link-graph-edge)',
            strokeWidth: relatedToActive || (hoveredId && relatedToHover) ? 2 : 1.35,
            opacity: dimmed ? 0.2 : 1,
          },
        }
      }),
    )
  }, [activeId, edges, graphCenterId, hoveredId, isPage, setFlowEdges, setNodes])

  const clearClickTimer = useCallback(() => {
    if (clickTimerRef.current != null) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
  }, [])

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: LinkGraphFlowNode) => {
      clearClickTimer()
      clickTimerRef.current = window.setTimeout(() => {
        clickTimerRef.current = null
        if (node.id.startsWith('tag:')) {
          onActivateTag(node.id, node.data.title)
          return
        }
        if (node.id.startsWith('entity:')) {
          onFocusEntity(node.id)
          return
        }
        onOpenDocument(node.id)
      }, 220)
    },
    [clearClickTimer, onActivateTag, onFocusEntity, onOpenDocument],
  )

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: LinkGraphFlowNode) => {
      clearClickTimer()
      if (node.id.startsWith('tag:')) {
        onActivateTag(node.id, node.data.title)
        return
      }
      if (node.id.startsWith('entity:')) {
        onFocusEntity(node.id)
        return
      }
      onFocusDocument(node.id)
    },
    [clearClickTimer, onActivateTag, onFocusDocument, onFocusEntity],
  )

  useEffect(() => () => clearClickTimer(), [clearClickTimer])

  return (
    <div className={cn('link-graph-rf', isPage && 'link-graph-rf--page', className)}>
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeMouseEnter={(_e, node) => setHoveredId(node.id)}
        onNodeMouseLeave={() => setHoveredId(null)}
        fitView
        fitViewOptions={{ padding: isPage ? 0.18 : 0.22 }}
        minZoom={0.2}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        edgesReconnectable={false}
        elementsSelectable
        panOnDrag
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        preventScrolling
        defaultEdgeOptions={{ type: 'default' }}
      >
        <Background
          id="link-graph-bg"
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.15}
          color="color-mix(in srgb, var(--color-accent) 28%, transparent)"
        />
        <LinkGraphZoomPanel />
        {isPage ? (
          <MiniMap
            className="link-graph-rf-minimap"
            pannable
            zoomable
            maskColor="color-mix(in srgb, var(--color-background) 55%, transparent)"
            nodeColor={(node) => {
              const data = node.data as LinkGraphNodeData | undefined
              if (data?.active) return 'var(--link-graph-node-active)'
              if (data?.color) return data.color
              if (data?.kind === 'tag') return 'var(--color-accent)'
              if (data?.kind === 'entity')
                return 'color-mix(in srgb, var(--color-accent) 55%, #fff)'
              return 'var(--link-graph-node)'
            }}
          />
        ) : null}
      </ReactFlow>
    </div>
  )
}

/** Connection map powered by [@xyflow/react](https://reactflow.dev). */
export function LinkGraphFlow(props: LinkGraphFlowProps) {
  return (
    <ReactFlowProvider>
      <LinkGraphFlowInner {...props} />
    </ReactFlowProvider>
  )
}
