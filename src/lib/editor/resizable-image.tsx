import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, GripVertical, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveImageSrc } from '@/lib/editor/image-utils'

export const ResizableImage = Image.extend({
  name: 'image',
  draggable: true,
  selectable: true,
  group: 'block',
  inline: false,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
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
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', HTMLAttributes]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  },
})

function ImageNodeView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [resizing, setResizing] = useState(false)
  const src = resolveImageSrc(node.attrs.src as string)
  const align = (node.attrs.align as string) ?? 'center'
  const width = (node.attrs.width as string) ?? '480px'

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
    if (!selected) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Delete' || event.key === 'Backspace') {
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
        <button
          type="button"
          className="image-drag-handle"
          contentEditable={false}
          data-drag-handle
          title="Presunúť obrázok"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {selected && (
          <div className="image-align-bar" contentEditable={false}>
            <button
              type="button"
              className={cn('image-align-btn', align === 'left' && 'is-active')}
              onClick={() => updateAttributes({ align: 'left' })}
              title="Vľavo"
            >
              <AlignLeft className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={cn('image-align-btn', align === 'center' && 'is-active')}
              onClick={() => updateAttributes({ align: 'center' })}
              title="Na stred"
            >
              <AlignCenter className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={cn('image-align-btn', align === 'right' && 'is-active')}
              onClick={() => updateAttributes({ align: 'right' })}
              title="Vpravo"
            >
              <AlignRight className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={cn('image-align-btn', align === 'float-left' && 'is-active')}
              onClick={() => updateAttributes({ align: 'float-left' })}
              title="Obtekanie vpravo"
            >
              <ImageIcon className="h-3 w-3" />
              L
            </button>
            <button
              type="button"
              className={cn('image-align-btn', align === 'float-right' && 'is-active')}
              onClick={() => updateAttributes({ align: 'float-right' })}
              title="Obtekanie vľavo"
            >
              <ImageIcon className="h-3 w-3" />
              P
            </button>
          </div>
        )}

        <img
          ref={imgRef}
          src={src}
          alt={(node.attrs.alt as string) ?? ''}
          style={{ width }}
          draggable={false}
          contentEditable={false}
        />

        {selected && (
          <span
            className="image-resize-handle"
            contentEditable={false}
            onMouseDown={onResizeStart}
            title="Zmeniť veľkosť"
          />
        )}
      </div>
    </NodeViewWrapper>
  )
}
