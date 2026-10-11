import { memo, useContext, useState } from 'react'
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { CanvasObjectActions } from '@/components/canvas/CanvasObjectActions'
import { cn } from '@/lib/utils'
import type { CanvasFlowNode } from '@/lib/canvas/flow'

function CanvasTextNodeInner({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const { t } = useTranslation()
  const { onTextChange } = useContext(CanvasObjectActions)
  const [editing, setEditing] = useState(false)
  const text = typeof data.text === 'string' ? data.text : ''
  const color = typeof data.color === 'string' ? data.color : 'var(--color-foreground)'
  const fontSize = Number.isFinite(data.fontSize) ? data.fontSize : 18

  return (
    <div
      className={cn('canvas-text-node', selected && 'is-selected')}
      style={{ color, fontSize }}
    >
      <NodeResizer
        minWidth={80}
        minHeight={32}
        isVisible={selected}
        lineClassName="canvas-resize-line"
        handleClassName="canvas-resize-handle"
      />
      <Handle type="target" position={Position.Left} className="canvas-handle" />
      <Handle type="source" position={Position.Right} className="canvas-handle" />
      {editing ? (
        <textarea
          className="canvas-text-input nodrag nowheel"
          value={text}
          autoFocus
          placeholder={t('canvas.textPlaceholder')}
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
          className={cn('canvas-text-label', !text.trim() && 'is-placeholder')}
          onDoubleClick={(event) => {
            event.stopPropagation()
            setEditing(true)
          }}
        >
          {text.trim() ? text : t('canvas.textPlaceholder')}
        </button>
      )}
    </div>
  )
}

export const CanvasTextNode = memo(CanvasTextNodeInner)
