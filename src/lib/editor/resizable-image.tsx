import { ReactNodeViewRenderer } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import { ImageBlock } from '@/components/editor/ImageBlock'

export const ResizableImage = Image.extend({
  name: 'image',
  draggable: true,
  selectable: true,
  group: 'block',
  inline: false,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => {
          if (element instanceof HTMLImageElement) return element.getAttribute('src')
          return element.querySelector?.('img')?.getAttribute('src') ?? null
        },
      },
      alt: { default: null },
      title: { default: null },
      caption: { default: null },
      width: {
        default: '480px',
        parseHTML: (element) => {
          const img =
            element instanceof HTMLImageElement
              ? element
              : element.querySelector?.('img')
          return img?.getAttribute('width') ?? (img as HTMLElement | null)?.style?.width ?? '480px'
        },
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
      {
        tag: 'img',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false
          // Allow empty placeholders without src (Notion-style).
          return {
            src: element.getAttribute('src'),
            alt: element.getAttribute('alt'),
            title: element.getAttribute('title'),
            width: element.getAttribute('width') ?? element.style.width,
            align: element.getAttribute('data-align') ?? 'center',
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { caption, align, ...imgAttrs } = HTMLAttributes as Record<string, unknown> & {
      caption?: string
      align?: string
    }
    const figureAttrs: Record<string, string> = {}
    if (align) figureAttrs['data-align'] = String(align)
    const media = imgAttrs.src
      ? (['img', imgAttrs] as [string, Record<string, unknown>])
      : (['div', { class: 'image-empty-export' }] as [string, Record<string, unknown>])
    if (caption) {
      return ['figure', figureAttrs, media, ['figcaption', {}, String(caption)]]
    }
    return ['figure', figureAttrs, media]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlock)
  },
})
