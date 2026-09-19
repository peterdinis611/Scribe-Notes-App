import { createContext, memo, useContext, useState } from 'react'
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { CanvasNoteNode as CanvasNoteNodeType } from '@/lib/canvas/flow'

export const CanvasNoteActions = createContext<{
  onTextChange: (id: string, text: string) => void
}>({
  onTextChange: () => undefined,
})

function CanvasNoteNodeInner({ id, data, selected }: NodeProps<CanvasNoteNodeType>) {
  const { t } = useTranslation()
  const { onTextChange } = useContext(CanvasNoteActions)
  const [editing, setEditing] = useState(false)
  const text = typeof data.text === 'string' ? data.text : ''

  return (
    <div className={cn('canvas-card canvas-card--flow', selected && 'is-selected')}>
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
