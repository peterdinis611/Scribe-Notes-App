import { memo } from 'react'
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/lib/routes'
import type { CanvasFlowNode } from '@/lib/canvas/flow'

function CanvasDocLinkNodeInner({ data, selected }: NodeProps<CanvasFlowNode>) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const title =
    (typeof data.documentTitle === 'string' && data.documentTitle.trim()) ||
    t('canvas.docLinkUntitled')
  const fill = typeof data.fill === 'string' ? data.fill : 'var(--color-surface-elevated)'
  const stroke = typeof data.stroke === 'string' ? data.stroke : 'var(--color-border)'
  const radius = Number.isFinite(data.cornerRadius) ? data.cornerRadius : 10
  const opacity = Number.isFinite(data.opacity) ? data.opacity : 1
  const docId = typeof data.documentId === 'string' ? data.documentId : ''

  return (
    <div
      className={cn('canvas-doclink', selected && 'is-selected')}
      style={{
        background: fill,
        borderColor: stroke,
        borderRadius: radius,
        opacity,
      }}
    >
      <NodeResizer
        minWidth={140}
        minHeight={48}
        isVisible={selected}
        lineClassName="canvas-resize-line"
        handleClassName="canvas-resize-handle"
      />
      <Handle type="target" position={Position.Left} className="canvas-handle" />
      <Handle type="source" position={Position.Right} className="canvas-handle" />
      <FileText className="canvas-doclink-icon h-4 w-4" />
      <div className="canvas-doclink-body">
        <span className="canvas-doclink-kind">{t('canvas.toolDocLink')}</span>
        <button
          type="button"
          className="canvas-doclink-title nodrag"
          disabled={!docId}
          onClick={(event) => {
            event.stopPropagation()
            if (!docId) return
            void navigate(ROUTES.document(docId))
          }}
        >
          {title}
        </button>
      </div>
    </div>
  )
}

export const CanvasDocLinkNode = memo(CanvasDocLinkNodeInner)
