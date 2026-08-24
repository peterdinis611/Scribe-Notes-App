import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Crop,
  Download,
  ImageIcon,
  Maximize2,
  PanelLeft,
  PanelRight,
  Replace,
  Settings2,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  downloadImageSrc,
  pickImageFiles,
  replaceImageFromFile,
  resolveImageSrc,
  saveCroppedImage,
} from '@/lib/editor/image-utils'
import { ImageCropDialog } from '@/components/editor/ImageCropDialog'
import { useAppSelector } from '@/store/hooks'

const MIN_WIDTH = 120
const DEFAULT_WIDTH = '480px'

type Align = 'left' | 'center' | 'right' | 'full' | 'float-left' | 'float-right'

export function ImageBlock({
  node,
  updateAttributes,
  selected,
  editor,
  deleteNode,
}: NodeViewProps) {
  const { t } = useTranslation()
  const documentId = useAppSelector((state) => state.documents.activeDocumentId)
  const imgRef = useRef<HTMLImageElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const captionRef = useRef<HTMLTextAreaElement>(null)
  const [resizing, setResizing] = useState(false)
  const [showAlt, setShowAlt] = useState(false)
  const [cropOpen, setCropOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [captionFocused, setCaptionFocused] = useState(false)
  const [altDraft, setAltDraft] = useState((node.attrs.alt as string) ?? '')
  const [captionDraft, setCaptionDraft] = useState((node.attrs.caption as string) ?? '')

  const src = resolveImageSrc(node.attrs.src as string)
  const rawSrc = (node.attrs.src as string) ?? ''
  const align = ((node.attrs.align as Align) ?? 'center') as Align
  const width = (node.attrs.width as string) ?? DEFAULT_WIDTH
  const caption = (node.attrs.caption as string) ?? ''
  const editable = editor.isEditable
  const isFull = align === 'full'
  const showChrome = (selected || captionFocused || showAlt) && editable

  useEffect(() => {
    setAltDraft((node.attrs.alt as string) ?? '')
    setCaptionDraft((node.attrs.caption as string) ?? '')
  }, [node.attrs.alt, node.attrs.caption])

  useEffect(() => {
    if (!selected && !captionFocused) setShowAlt(false)
  }, [captionFocused, selected])

  useEffect(() => {
    const el = captionRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [captionDraft])

  const maxWidthForEditor = useCallback(() => {
    const parent = frameRef.current?.closest('.tiptap') as HTMLElement | null
    const measured = parent?.clientWidth ?? imgRef.current?.parentElement?.clientWidth
    return measured && measured > MIN_WIDTH ? measured : 960
  }, [])

  const onResizeStart = useCallback(
    (edge: 'left' | 'right') => (event: MouseEvent) => {
      if (!editable || isFull) return
      event.preventDefault()
      event.stopPropagation()
      setResizing(true)

      const startX = event.clientX
      const startWidth = imgRef.current?.getBoundingClientRect().width ?? 480
      const maxWidth = maxWidthForEditor()

      function onMove(moveEvent: globalThis.MouseEvent) {
        const delta =
          edge === 'right' ? moveEvent.clientX - startX : startX - moveEvent.clientX
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
    [align, editable, isFull, maxWidthForEditor, updateAttributes],
  )

  useEffect(() => {
    if (!selected || !editable) return
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea')) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteNode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteNode, editable, selected])

  function setAlign(next: Align) {
    if (next === 'full') {
      updateAttributes({ align: 'full', width: '100%' })
      return
    }
    const nextWidth = width === '100%' ? DEFAULT_WIDTH : width
    updateAttributes({ align: next, width: nextWidth })
  }

  async function handleReplace() {
    if (!documentId || busy) return
    const files = await pickImageFiles({ multiple: false })
    const file = files[0]
    if (!file) return
    setBusy(true)
    try {
      const path = await replaceImageFromFile(documentId, file)
      updateAttributes({ src: path, alt: file.name })
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload() {
    if (!rawSrc || busy) return
    setBusy(true)
    try {
      const name = ((node.attrs.alt as string) || 'image').replace(/\.[^.]+$/, '')
      await downloadImageSrc(rawSrc, name)
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

  function commitAlt() {
    updateAttributes({ alt: altDraft.trim() || null })
  }

  return (
    <NodeViewWrapper
      className={cn(
        'image-block',
        `image-align-${align}`,
        selected && 'is-selected',
        resizing && 'is-resizing',
        isFull && 'is-full',
        busy && 'is-busy',
      )}
      data-align={align}
    >
      <div ref={frameRef} className="image-block-inner">
        {showChrome && (
          <div className="image-toolbar" contentEditable={false}>
            <div className="image-toolbar-group" role="group" aria-label={t('image.alignGroup')}>
              <ToolbarBtn
                active={align === 'left'}
                onClick={() => setAlign('left')}
                title={t('image.alignLeft')}
              >
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
              <ToolbarBtn
                active={align === 'full'}
                onClick={() => setAlign('full')}
                title={t('image.fullWidth')}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </ToolbarBtn>
            </div>

            <span className="image-toolbar-sep" />

            <div className="image-toolbar-group" role="group" aria-label={t('image.wrapGroup')}>
              <ToolbarBtn
                active={align === 'float-left'}
                onClick={() => setAlign('float-left')}
                title={t('image.floatLeft')}
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                active={align === 'float-right'}
                onClick={() => setAlign('float-right')}
                title={t('image.floatRight')}
              >
                <PanelRight className="h-3.5 w-3.5" />
              </ToolbarBtn>
            </div>

            <span className="image-toolbar-sep" />

            <div className="image-toolbar-group">
              <ToolbarBtn onClick={() => setCropOpen(true)} title={t('image.crop')}>
                <Crop className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => void handleReplace()} title={t('image.replace')} disabled={busy}>
                <Replace className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => void handleDownload()} title={t('image.download')} disabled={busy}>
                <Download className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                active={showAlt}
                onClick={() => setShowAlt((value) => !value)}
                title={t('image.properties')}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </ToolbarBtn>
            </div>

            <span className="image-toolbar-sep" />

            <ToolbarBtn
              className="image-toolbar-btn--danger"
              onClick={() => deleteNode()}
              title={t('image.delete')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </ToolbarBtn>
          </div>
        )}

        <div className="image-media" contentEditable={false}>
          {src ? (
            <img
              ref={imgRef}
              src={src}
              alt={(node.attrs.alt as string) ?? ''}
              title={(node.attrs.title as string) ?? undefined}
              style={{ width: isFull ? '100%' : width }}
              draggable={false}
            />
          ) : (
            <div className="image-placeholder">
              <ImageIcon className="h-8 w-8" />
              <span>{t('image.missing')}</span>
            </div>
          )}

          {showChrome && !isFull && (
            <>
              <span
                className="image-resize-edge image-resize-edge--left"
                onMouseDown={onResizeStart('left')}
                title={t('image.resize')}
              />
              <span
                className="image-resize-edge image-resize-edge--right"
                onMouseDown={onResizeStart('right')}
                title={t('image.resize')}
              />
            </>
          )}
        </div>

        {(editable || caption) && (
          <div className="image-caption-wrap" contentEditable={false}>
            <textarea
              ref={captionRef}
              className={cn('image-caption', !captionDraft && 'is-empty')}
              value={captionDraft}
              readOnly={!editable}
              rows={1}
              placeholder={editable ? t('image.captionEmpty') : undefined}
              onChange={(event) => setCaptionDraft(event.target.value)}
              onFocus={() => setCaptionFocused(true)}
              onBlur={() => {
                setCaptionFocused(false)
                commitCaption()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  commitCaption()
                  captionRef.current?.blur()
                  editor.commands.focus()
                }
                event.stopPropagation()
              }}
              aria-label={t('image.caption')}
            />
          </div>
        )}

        {showChrome && showAlt && (
          <div className="image-props-panel" contentEditable={false}>
            <label className="image-props-field">
              <span>{t('image.alt')}</span>
              <input
                value={altDraft}
                onChange={(event) => setAltDraft(event.target.value)}
                onBlur={commitAlt}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder={t('image.altPlaceholder')}
              />
            </label>
          </div>
        )}
      </div>

      <ImageCropDialog
        open={cropOpen}
        src={src}
        onClose={() => setCropOpen(false)}
        onCropped={(dataUrl) => {
          void (async () => {
            setCropOpen(false)
            if (!documentId) {
              updateAttributes({ src: dataUrl })
              return
            }
            setBusy(true)
            try {
              const path = await saveCroppedImage(documentId, dataUrl)
              updateAttributes({ src: path })
            } catch {
              updateAttributes({ src: dataUrl })
            } finally {
              setBusy(false)
            }
          })()
        }}
      />
    </NodeViewWrapper>
  )
}

function ToolbarBtn({
  children,
  title,
  onClick,
  active,
  disabled,
  className,
}: {
  children: ReactNode
  title: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      className={cn('image-toolbar-btn', active && 'is-active', className)}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
