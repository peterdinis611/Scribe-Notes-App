import { memo, useContext, useState } from 'react'
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { CanvasObjectActions } from '@/components/canvas/CanvasObjectActions'
import { cn } from '@/lib/utils'
import type { CanvasFlowNode } from '@/lib/canvas/flow'

function CanvasFrameNodeInner({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const { t } = useTranslation()
  const { onLabelChange } = useContext(CanvasObjectActions)
  const [editing, setEditing] = useState(false)
  const label = typeof data.label === 'string' && data.label ? data.label : t('canvas.frameDefault')
  const fill = typeof data.fill === 'string' ? data.fill : 'transparent'
  const stroke = typeof data.stroke === 'string' ? data.stroke : 'var(--color-border)'
  const strokeWidth = Number.isFinite(data.strokeWidth) ? data.strokeWidth : 1.5

  return (
    <div
      className={cn('canvas-frame', selected && 'is-selected')}
      style={{
        background: fill,
        borderColor: stroke,
        borderWidth: strokeWidth,
      }}
    >
      <NodeResizer
        minWidth={160}
        minHeight={120}
        isVisible={selected}
        lineClassName="canvas-resize-line"
        handleClassName="canvas-resize-handle"
      />
      <Handle type="target" position={Position.Left} className="canvas-handle" />
      <Handle type="source" position={Position.Right} className="canvas-handle" />
      <div className="canvas-frame-chrome">
        {editing ? (
          <input
            className="canvas-frame-label-input nodrag nowheel"
            value={typeof data.label === 'string' ? data.label : ''}
            autoFocus
            placeholder={t('canvas.frameDefault')}
            onChange={(event) => onLabelChange(id, event.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault()
                setEditing(false)
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="canvas-frame-label"
            onDoubleClick={(event) => {
              event.stopPropagation()
              setEditing(true)
            }}
          >
            {label}
          </button>
        )}
      </div>
    </div>
  )
}

export const CanvasFrameNode = memo(CanvasFrameNodeInner)
