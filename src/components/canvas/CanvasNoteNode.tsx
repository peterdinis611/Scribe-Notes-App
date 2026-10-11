import { memo, useContext, useState } from 'react'
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { CanvasObjectActions } from '@/components/canvas/CanvasObjectActions'
import { cn } from '@/lib/utils'
import type { CanvasNoteNode as CanvasNoteNodeType } from '@/lib/canvas/flow'

function CanvasNoteNodeInner({ id, data, selected }: NodeProps<CanvasNoteNodeType>) {
  const { t } = useTranslation()
  const { onTextChange } = useContext(CanvasObjectActions)
  const [editing, setEditing] = useState(false)
  const text = typeof data.text === 'string' ? data.text : ''
  const fill = typeof data.fill === 'string' ? data.fill : 'var(--color-surface-elevated)'
  const stroke = typeof data.stroke === 'string' ? data.stroke : 'var(--color-border)'
  const color = typeof data.color === 'string' ? data.color : 'var(--color-foreground)'
  const fontSize = Number.isFinite(data.fontSize) ? data.fontSize : 14
  const opacity = Number.isFinite(data.opacity) ? data.opacity : 1
  const radius = Number.isFinite(data.cornerRadius) ? data.cornerRadius : 10

  return (
    <div
      className={cn('canvas-card canvas-card--flow', selected && 'is-selected')}
      style={{
        background: fill,
        borderColor: stroke,
        color,
        fontSize,
        opacity,
        borderRadius: radius,
      }}
    >
      <NodeResizer
        minWidth={120}
        minHeight={80}
        isVisible={selected}
        lineClassName="canvas-resize-line"
        handleClassName="canvas-resize-handle"
      />
      <Handle type="target" position={Position.Left} className="canvas-handle" />
      <Handle type="source" position={Position.Right} className="canvas-handle" />
      {editing ? (
        <textarea
          className="canvas-card-input nodrag nowheel"
          value={text}
          autoFocus
          placeholder={t('canvas.cardPlaceholder')}
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
          className={cn('canvas-card-text', !text.trim() && 'is-placeholder')}
          onDoubleClick={(event) => {
            event.stopPropagation()
            setEditing(true)
          }}
        >
          {text.trim() ? text : t('canvas.cardPlaceholder')}
        </button>
      )}
    </div>
  )
}

export const CanvasNoteNode = memo(CanvasNoteNodeInner)
export { CanvasNoteActions } from '@/components/canvas/CanvasObjectActions'
