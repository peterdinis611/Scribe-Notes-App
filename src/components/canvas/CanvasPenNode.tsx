import { memo, useMemo } from 'react'
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import type { CanvasFlowNode } from '@/lib/canvas/flow'

function CanvasPenNodeInner({ data, selected }: NodeProps<CanvasFlowNode>) {
  const stroke = typeof data.stroke === 'string' ? data.stroke : 'var(--color-accent)'
  const strokeWidth = Number.isFinite(data.strokeWidth) ? data.strokeWidth : 2.5
  const opacity = Number.isFinite(data.opacity) ? data.opacity : 1
  const points = Array.isArray(data.points) ? data.points : []

  const { path, viewBox } = useMemo(() => {
    if (points.length === 0) {
      return { path: '', viewBox: '0 0 100 100' }
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    const pad = strokeWidth + 2
    const vb = `${minX - pad} ${minY - pad} ${Math.max(1, maxX - minX) + pad * 2} ${Math.max(1, maxY - minY) + pad * 2}`
    const d = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ')
    return { path: d, viewBox: vb }
  }, [points, strokeWidth])

  return (
    <div className={cn('canvas-pen-node', selected && 'is-selected')} style={{ opacity }}>
      <NodeResizer
        minWidth={40}
        minHeight={40}
        isVisible={selected}
        lineClassName="canvas-resize-line"
        handleClassName="canvas-resize-handle"
      />
      <Handle type="target" position={Position.Left} className="canvas-handle" />
      <Handle type="source" position={Position.Right} className="canvas-handle" />
      <svg className="canvas-pen-svg" viewBox={viewBox} preserveAspectRatio="none">
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

export const CanvasPenNode = memo(CanvasPenNodeInner)
