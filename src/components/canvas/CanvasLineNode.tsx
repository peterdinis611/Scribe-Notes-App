import { memo } from 'react'
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import type { CanvasFlowNode } from '@/lib/canvas/flow'

function CanvasLineNodeInner({ data, selected, type }: NodeProps<CanvasFlowNode>) {
  const isArrow = type === 'arrow' || data.kind === 'arrow'
  const stroke = typeof data.stroke === 'string' ? data.stroke : 'var(--color-accent)'
  const strokeWidth = Number.isFinite(data.strokeWidth) ? data.strokeWidth : 2
  const opacity = Number.isFinite(data.opacity) ? data.opacity : 1

  return (
    <div className={cn('canvas-line-node', selected && 'is-selected')} style={{ opacity }}>
      <NodeResizer
        minWidth={40}
        minHeight={16}
        isVisible={selected}
        lineClassName="canvas-resize-line"
        handleClassName="canvas-resize-handle"
      />
      <Handle type="target" position={Position.Left} className="canvas-handle" />
      <Handle type="source" position={Position.Right} className="canvas-handle" />
      <svg className="canvas-line-svg" viewBox="0 0 100 24" preserveAspectRatio="none">
        <line
          x1="4"
          y1="12"
          x2={isArrow ? 86 : 96}
          y2="12"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {isArrow && (
          <polygon points="86,6 96,12 86,18" fill={stroke} />
        )}
      </svg>
    </div>
  )
}

export const CanvasLineNode = memo(CanvasLineNodeInner)
