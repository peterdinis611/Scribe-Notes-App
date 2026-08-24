import { ReactNodeViewRenderer } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import { ImageBlock } from '@/components/editor/ImageBlock'

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
    return ReactNodeViewRenderer(ImageBlock)
  },
})
