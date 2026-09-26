import '@google/model-viewer'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Box,
  Maximize2,
  Replace,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconTooltip } from '@/components/ui/tooltip'
import { pickModel3dFiles, replaceImageFromFile, resolveImageSrc } from '@/lib/editor/image-utils'
import { useAppSelector } from '@/store/hooks'

const MIN_WIDTH = 160
const DEFAULT_WIDTH = '480px'
const DEFAULT_HEIGHT = '320px'

type Align = 'left' | 'center' | 'right' | 'full'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string
          poster?: string
          alt?: string
          'camera-controls'?: boolean | string
          'auto-rotate'?: boolean | string
          'shadow-intensity'?: string
          'exposure'?: string
          'touch-action'?: string
          style?: React.CSSProperties
        },
        HTMLElement
      >
    }
  }
}

export function Model3dBlock({
  node,
  updateAttributes,
  selected,
  editor,
  deleteNode,
  getPos,
}: NodeViewProps) {
  const { t } = useTranslation()
  const documentId = useAppSelector((state) => state.documents.activeDocumentId)
  const frameRef = useRef<HTMLDivElement>(null)
  const captionRef = useRef<HTMLTextAreaElement>(null)
  const [resizing, setResizing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [captionFocused, setCaptionFocused] = useState(false)
  const [captionDraft, setCaptionDraft] = useState((node.attrs.caption as string) ?? '')

  const rawSrc = (node.attrs.src as string) ?? ''
  const src = resolveImageSrc(rawSrc)
  const posterRaw = (node.attrs.poster as string) ?? ''
  const poster = posterRaw ? resolveImageSrc(posterRaw) : undefined
  const align = ((node.attrs.align as Align) ?? 'center') as Align
  const width = (node.attrs.width as string) ?? DEFAULT_WIDTH
  const autoRotate = node.attrs.autoRotate !== false
  const cameraControls = node.attrs.cameraControls !== false
  const editable = editor.isEditable
  const isFull = align === 'full'
  const isEmpty = !rawSrc
  const showChrome = (selected || captionFocused || isEmpty) && editable

  useEffect(() => {
    setCaptionDraft((node.attrs.caption as string) ?? '')
  }, [node.attrs.caption])

  useEffect(() => {
    const el = captionRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [captionDraft])

  const maxWidthForEditor = useCallback(() => {
    const parent = frameRef.current?.closest('.tiptap') as HTMLElement | null
    const measured = parent?.clientWidth ?? frameRef.current?.parentElement?.clientWidth
    return measured && measured > MIN_WIDTH ? measured : 960
  }, [])

  const onResizeStart = useCallback(
    (edge: 'left' | 'right' | 'corner') => (event: MouseEvent) => {
      if (!editable || isFull || isEmpty) return
      event.preventDefault()
      event.stopPropagation()
      setResizing(true)

      const startX = event.clientX
      const startWidth = frameRef.current?.getBoundingClientRect().width ?? 480
      const maxWidth = maxWidthForEditor()

      function onMove(moveEvent: globalThis.MouseEvent) {
        const delta =
          edge === 'left' ? startX - moveEvent.clientX : moveEvent.clientX - startX
        const next = Math.max(MIN_WIDTH, Math.min(maxWidth, startWidth + delta))
        updateAttributes({
          width: `${Math.round(next)}px`,
          align: align === 'full' ? 'center' : align,
        })
      }

      function onUp() {
        setResizing(false)
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [align, editable, isEmpty, isFull, maxWidthForEditor, updateAttributes],
  )

  useEffect(() => {
    if (!selected || !editable) return
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, model-viewer')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        const pos = getPos()
        if (typeof pos === 'number') {
          editor.chain().focus().setTextSelection(pos + node.nodeSize).run()
        } else {
          editor.commands.focus()
        }
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteNode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteNode, editable, editor, getPos, node.nodeSize, selected])

  function setAlign(next: Align) {
    if (next === 'full') {
      updateAttributes({ align: 'full', width: '100%' })
      return
    }
    const nextWidth = width === '100%' ? DEFAULT_WIDTH : width
    updateAttributes({ align: next, width: nextWidth })
  }

  async function handleUpload() {
    if (!documentId || busy) return
    const files = await pickModel3dFiles({ multiple: false })
    const file = files[0]
    if (!file) return
    setBusy(true)
    try {
      const path = await replaceImageFromFile(documentId, file)
      updateAttributes({ src: path })
    } finally {
      setBusy(false)
    }
  }

  function commitCaption() {
    const next = captionDraft.trim() || null
    if (next !== ((node.attrs.caption as string) ?? null)) {
      updateAttributes({ caption: next })
    }
  }

  return (
    <NodeViewWrapper
      className={cn(
        'image-block model-3d-block',
        `image-align-${align}`,
        selected && 'is-selected',
        resizing && 'is-resizing',
        isFull && 'is-full',
        busy && 'is-busy',
        isEmpty && 'is-empty',
      )}
      data-align={align}
      data-type="model-3d"
    >
      <div ref={frameRef} className="image-block-inner" style={isFull ? undefined : { width }}>
        {showChrome && !isEmpty && (
          <div className="image-toolbar" contentEditable={false}>
            <div className="image-toolbar-group" role="group" aria-label={t('model3d.alignGroup')}>
              <ToolbarBtn active={align === 'left'} onClick={() => setAlign('left')} title={t('image.alignLeft')}>
                <AlignLeft className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                active={align === 'center'}
                onClick={() => setAlign('center')}
                title={t('image.alignCenter')}
              >
                <AlignCenter className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                active={align === 'right'}
                onClick={() => setAlign('right')}
                title={t('image.alignRight')}
              >
                <AlignRight className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn active={align === 'full'} onClick={() => setAlign('full')} title={t('image.fullWidth')}>
                <Maximize2 className="h-3.5 w-3.5" />
              </ToolbarBtn>
            </div>

            <span className="image-toolbar-sep" />

            <div className="image-toolbar-group">
              <ToolbarBtn
                active={autoRotate}
                onClick={() => updateAttributes({ autoRotate: !autoRotate })}
                title={t('model3d.autoRotate')}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                active={cameraControls}
                onClick={() => updateAttributes({ cameraControls: !cameraControls })}
                title={t('model3d.cameraControls')}
              >
                ◐
              </ToolbarBtn>
              <ToolbarBtn onClick={() => void handleUpload()} title={t('model3d.replace')} disabled={busy}>
                <Replace className="h-3.5 w-3.5" />
              </ToolbarBtn>
            </div>

            <span className="image-toolbar-sep" />

            <ToolbarBtn className="image-toolbar-btn--danger" onClick={() => deleteNode()} title={t('model3d.delete')}>
              <Trash2 className="h-3.5 w-3.5" />
            </ToolbarBtn>
          </div>
        )}

        <div
          className="image-media model-3d-media"
          contentEditable={false}
          {...(!isEmpty ? { 'data-drag-handle': '' } : {})}
        >
          {isEmpty ? (
            <div className="image-placeholder image-placeholder--notion">
              <Box className="h-8 w-8" />
              <span>{t('model3d.emptyTitle')}</span>
              <span className="image-placeholder-hint">{t('model3d.emptyHint')}</span>
              {editable ? (
                <div className="image-placeholder-actions">
                  <button
                    type="button"
                    className="image-placeholder-btn"
                    onClick={() => void handleUpload()}
                    disabled={busy}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {t('model3d.upload')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <model-viewer
              src={src}
              poster={poster}
              alt={t('model3d.alt')}
              camera-controls={cameraControls ? true : undefined}
              auto-rotate={autoRotate ? true : undefined}
              shadow-intensity="0.6"
              exposure="1"
              touch-action="pan-y"
              style={{ width: '100%', height: DEFAULT_HEIGHT, background: 'transparent' }}
            />
          )}

          {!isEmpty && editable && !isFull && (
            <>
              <span className="image-resize-edge image-resize-edge--left" onMouseDown={onResizeStart('left')} />
              <span className="image-resize-edge image-resize-edge--right" onMouseDown={onResizeStart('right')} />
              <span className="image-resize-corner" onMouseDown={onResizeStart('corner')} />
            </>
          )}
        </div>

        {(editable || Boolean(node.attrs.caption)) && !isEmpty && (
          <textarea
            ref={captionRef}
            className="image-caption"
            rows={1}
            value={captionDraft}
            placeholder={t('image.captionPlaceholder')}
            disabled={!editable}
            onFocus={() => setCaptionFocused(true)}
            onBlur={() => {
              setCaptionFocused(false)
              commitCaption()
            }}
            onChange={(event) => setCaptionDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                ;(event.target as HTMLTextAreaElement).blur()
              }
            }}
          />
        )}
      </div>
    </NodeViewWrapper>
  )
}

function ToolbarBtn({
  children,
  onClick,
  title,
  active,
  disabled,
  className,
}: {
  children: ReactNode
  onClick: () => void
  title: string
  active?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <IconTooltip label={title}>
      <button
        type="button"
        className={cn('image-toolbar-btn', active && 'is-active', className)}
        aria-label={title}
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onClick()
        }}
      >
        {children}
      </button>
    </IconTooltip>
  )
}
