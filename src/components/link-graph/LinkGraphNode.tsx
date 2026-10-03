import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import type { ForceNodeKind } from '@/lib/link-graph/force-layout'

export const LINK_GRAPH_NODE_TYPE = 'linkGraph' as const

export type LinkGraphNodeData = {
  title: string
  orphan: boolean
  degree: number
  color?: string
  kind: ForceNodeKind
  active: boolean
  dimmed: boolean
  hovered: boolean
  isPage: boolean
  /** Dense orphan maps: hide idle labels to avoid overlap. */
  sparseLabels?: boolean
}

export type LinkGraphFlowNode = Node<LinkGraphNodeData, typeof LINK_GRAPH_NODE_TYPE>

function nodeRadius(data: LinkGraphNodeData): number {
  const { kind, degree, orphan, active, isPage } = data
  if (kind === 'tag') return isPage ? 9 : 7
  if (kind === 'entity') {
    const base = isPage ? 6 : 5
    const byDegree = Math.min(isPage ? 6 : 4, degree * 0.8)
    return base + byDegree + (active ? 2 : 0)
  }
  const base = isPage ? 7 : 5.5
  const byDegree = Math.min(isPage ? 10 : 7, degree * (isPage ? 1.6 : 1.2))
  // Keep orphan dots readable when idle labels are hidden (sparse maps).
  const orphanShrink = orphan && !data.sparseLabels ? 0.72 : orphan ? 0.88 : 1
  const activeBoost = active ? (isPage ? 4 : 3) : 0
  return (base + byDegree) * orphanShrink + activeBoost
}

function LinkGraphNodeComponent({ data }: NodeProps<LinkGraphFlowNode>) {
  const r = nodeRadius(data)
  const size = Math.max(28, Math.round(r * 2 + 8))
  const labelMax = data.isPage ? (data.sparseLabels ? 18 : 26) : 14
  const label =
    data.title.length > labelMax ? `${data.title.slice(0, labelMax - 1)}…` : data.title
  const showLabel = data.sparseLabels
    ? data.active || data.hovered
    : data.isPage || data.active || data.hovered || !data.dimmed

  return (
    <div
      className={cn(
        'link-graph-rf-node',
        data.active && 'is-active',
        data.orphan && 'is-orphan',
        data.hovered && 'is-hovered',
        data.dimmed && 'is-dim',
        data.sparseLabels && 'is-sparse-labels',
        data.kind === 'tag' && 'is-tag',
        data.kind === 'entity' && 'is-entity',
      )}
      style={{ width: size, height: size }}
      title={data.title}
    >
      <Handle type="target" position={Position.Top} className="link-graph-rf-handle" />
      <Handle type="source" position={Position.Bottom} className="link-graph-rf-handle" />
      {(data.active || data.hovered) && <span className="link-graph-rf-glow" aria-hidden="true" />}
      <span
        className="link-graph-rf-core"
        style={{
          width: r * 2,
          height: r * 2,
          ...(!data.active && !data.hovered && data.color ? { background: data.color } : null),
        }}
      />
      {showLabel ? <span className="link-graph-rf-label">{label}</span> : null}
    </div>
  )
}

export const LinkGraphNode = memo(LinkGraphNodeComponent)
