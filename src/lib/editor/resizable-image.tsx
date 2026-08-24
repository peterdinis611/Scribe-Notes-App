import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlignCenter, AlignLeft, AlignRight, Crop, ImageIcon, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveImageSrc } from '@/lib/editor/image-utils'
import { ImageCropDialog } from '@/components/editor/ImageCropDialog'

export const ResizableImage = Image.extend({
  name: 'image',
  draggable: false,
  selectable: true,
  group: 'block',
  inline: false,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      caption: { default: null },
      width: {
        default: '480px',
        parseHTML: (element) => element.getAttribute('width') ?? element.style.width,
        renderHTML: (attributes) => {
          if (!attributes.width) return {}
          return { width: attributes.width, style: `width: ${attributes.width}` }
        },
      },
      align: {
        default: 'center',
        parseHTML: (element) => element.getAttribute('data-align') ?? 'center',
        renderHTML: (attributes) => ({
          'data-align': attributes.align,
        }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'figure',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false
          const img = element.querySelector('img')
          if (!img) return false
          const caption = element.querySelector('figcaption')?.textContent ?? null
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt'),
            title: img.getAttribute('title'),
            caption,
            width: img.getAttribute('width') ?? img.style.width,
            align: element.getAttribute('data-align') ?? 'center',
          }
        },
      },
      { tag: 'img[src]' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { caption, align, ...imgAttrs } = HTMLAttributes as Record<string, unknown> & {
      caption?: string
      align?: string
    }
    const figureAttrs: Record<string, string> = {}
    if (align) figureAttrs['data-align'] = String(align)
    if (caption) {
      return [
        'figure',
        figureAttrs,
        ['img', imgAttrs],
        ['figcaption', {}, String(caption)],
      ]
    }
    return ['figure', figureAttrs, ['img', imgAttrs]]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  },
})

function ImageNodeView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const { t } = useTranslation()
  const imgRef = useRef<HTMLImageElement>(null)
  const [resizing, setResizing] = useState(false)
  const [showProps, setShowProps] = useState(false)
  const [cropOpen, setCropOpen] = useState(false)
  const [altDraft, setAltDraft] = useState((node.attrs.alt as string) ?? '')
  const [captionDraft, setCaptionDraft] = useState((node.attrs.caption as string) ?? '')
  const src = resolveImageSrc(node.attrs.src as string)
  const align = (node.attrs.align as string) ?? 'center'
  const width = (node.attrs.width as string) ?? '480px'
  const caption = (node.attrs.caption as string) ?? ''

  useEffect(() => {
    setAltDraft((node.attrs.alt as string) ?? '')
    setCaptionDraft((node.attrs.caption as string) ?? '')
  }, [node.attrs.alt, node.attrs.caption])

  const onResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setResizing(true)

      const startX = event.clientX
      const startWidth = imgRef.current?.getBoundingClientRect().width ?? 480

      function onMove(moveEvent: MouseEvent) {
        const next = Math.max(120, Math.min(900, startWidth + moveEvent.clientX - startX))
        updateAttributes({ width: `${Math.round(next)}px` })
      }

      function onUp() {
        setResizing(false)
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [updateAttributes],
  )

  useEffect(() => {
    if (!selected) {
      setShowProps(false)
      return
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const target = event.target as HTMLElement | null
        if (target?.closest('input, textarea')) return
        editor.chain().focus().deleteSelection().run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor, selected])

  return (
    <NodeViewWrapper
      className={cn(
        'image-block my-4',
        `image-align-${align}`,
        selected && 'is-selected',
        resizing && 'is-resizing',
      )}
      data-align={align}
    >
      <div className="image-block-inner">
        {selected && (
          <div className="image-align-bar" contentEditable={false}>
            <button
              type="button"
              className={cn('image-align-btn', align === 'left' && 'is-active')}
              onClick={() => updateAttributes({ align: 'left' })}
              title={t('image.alignLeft')}
            >
              <AlignLeft className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={cn('image-align-btn', align === 'center' && 'is-active')}
              onClick={() => updateAttributes({ align: 'center' })}
              title={t('image.alignCenter')}
            >
              <AlignCenter className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={cn('image-align-btn', align === 'right' && 'is-active')}
              onClick={() => updateAttributes({ align: 'right' })}
              title={t('image.alignRight')}
            >
              <AlignRight className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={cn('image-align-btn', align === 'float-left' && 'is-active')}
              onClick={() => updateAttributes({ align: 'float-left' })}
              title={t('image.floatLeft')}
            >
              <ImageIcon className="h-3 w-3" />
              L
            </button>
            <button
              type="button"
              className={cn('image-align-btn', align === 'float-right' && 'is-active')}
              onClick={() => updateAttributes({ align: 'float-right' })}
              title={t('image.floatRight')}
            >
              <ImageIcon className="h-3 w-3" />
              P
            </button>
            <button
              type="button"
              className={cn('image-align-btn', showProps && 'is-active')}
              onClick={() => setShowProps((value) => !value)}
              title={t('image.properties')}
            >
              <Settings2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="image-align-btn"
              onClick={() => setCropOpen(true)}
              title={t('image.crop')}
            >
              <Crop className="h-3 w-3" />
            </button>
          </div>
        )}

        <img
          ref={imgRef}
          src={src}
          alt={(node.attrs.alt as string) ?? ''}
          title={(node.attrs.title as string) ?? undefined}
          style={{ width }}
          draggable={false}
          contentEditable={false}
        />

        {(caption || selected) && (
          <figcaption
            className="image-caption"
            contentEditable={false}
          >
            {caption || (selected ? t('image.captionEmpty') : '')}
          </figcaption>
        )}

        {selected && showProps && (
          <div className="image-props-panel" contentEditable={false}>
            <label className="image-props-field">
              <span>{t('image.alt')}</span>
              <input
                value={altDraft}
                onChange={(event) => setAltDraft(event.target.value)}
                onBlur={() => updateAttributes({ alt: altDraft.trim() || null })}
                placeholder={t('image.altPlaceholder')}
              />
            </label>
            <label className="image-props-field">
              <span>{t('image.caption')}</span>
              <input
                value={captionDraft}
                onChange={(event) => setCaptionDraft(event.target.value)}
                onBlur={() => updateAttributes({ caption: captionDraft.trim() || null })}
                placeholder={t('image.captionPlaceholder')}
              />
            </label>
          </div>
        )}

        {selected && (
          <span
            className="image-resize-handle"
            contentEditable={false}
            onMouseDown={onResizeStart}
            title={t('image.resize')}
          />
        )}
      </div>

      <ImageCropDialog
        open={cropOpen}
        src={src}
        onClose={() => setCropOpen(false)}
        onCropped={(dataUrl) => {
          updateAttributes({ src: dataUrl })
          setCropOpen(false)
        }}
      />
    </NodeViewWrapper>
  )
}
