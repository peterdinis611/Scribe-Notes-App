import { memo, useContext, useState } from 'react'
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { CanvasObjectActions } from '@/components/canvas/CanvasObjectActions'
import { cn } from '@/lib/utils'
import type { CanvasFlowNode } from '@/lib/canvas/flow'

function CanvasShapeNodeInner({ id, data, selected, type }: NodeProps<CanvasFlowNode>) {
  const { t } = useTranslation()
  const { onTextChange } = useContext(CanvasObjectActions)
  const [editing, setEditing] = useState(false)
  const text = typeof data.text === 'string' ? data.text : ''
  const isEllipse = type === 'ellipse' || data.kind === 'ellipse'
  const fill = typeof data.fill === 'string' ? data.fill : 'transparent'
  const stroke = typeof data.stroke === 'string' ? data.stroke : 'var(--color-accent)'
  const strokeWidth = Number.isFinite(data.strokeWidth) ? data.strokeWidth : 1.5
  const color = typeof data.color === 'string' ? data.color : 'var(--color-foreground)'
  const fontSize = Number.isFinite(data.fontSize) ? data.fontSize : 14
  const opacity = Number.isFinite(data.opacity) ? data.opacity : 1
  const radius = isEllipse
    ? 999
    : Number.isFinite(data.cornerRadius)
      ? data.cornerRadius
      : 10

  return (
    <div
      className={cn(
        'canvas-shape',
        isEllipse && 'canvas-shape--ellipse',
        selected && 'is-selected',
      )}
      style={{
        background: fill,
        borderColor: stroke,
        borderWidth: strokeWidth,
        color,
        fontSize,
        opacity,
        borderRadius: radius,
      }}
    >
      <NodeResizer
        minWidth={48}
        minHeight={48}
        isVisible={selected}
        keepAspectRatio={isEllipse}
        lineClassName="canvas-resize-line"
        handleClassName="canvas-resize-handle"
      />
      <Handle type="target" position={Position.Left} className="canvas-handle" />
      <Handle type="source" position={Position.Right} className="canvas-handle" />
      {editing ? (
        <textarea
          className="canvas-shape-input nodrag nowheel"
          value={text}
          autoFocus
          placeholder={t('canvas.shapePlaceholder')}
          onChange={(event) => onTextChange(id, event.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setEditing(false)
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={cn('canvas-shape-label', !text.trim() && 'is-empty')}
          onDoubleClick={(event) => {
            event.stopPropagation()
            setEditing(true)
          }}
        >
          {text.trim() || ''}
        </button>
      )}
    </div>
  )
}

export const CanvasShapeNode = memo(CanvasShapeNodeInner)
