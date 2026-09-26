import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { PaintBlock } from '@/components/editor/PaintBlock'
import {
  PAINT_DEFAULT_BG,
  PAINT_DEFAULT_HEIGHT,
  PAINT_DEFAULT_WIDTH,
  PAINT_EMPTY_STROKES,
} from '@/lib/editor/paint'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paintPad: {
      insertPaintPad: (options?: {
        strokes?: string
        background?: string
        width?: number
        height?: number
        ocrText?: string
        pos?: number
      }) => ReturnType
      updatePaintPad: (options?: {
        strokes?: string
        background?: string
        width?: number
        height?: number
        ocrText?: string | null
        pos?: number
      }) => ReturnType
      deletePaintPad: (options?: { pos?: number }) => ReturnType
    }
  }
}

export const PaintPad = Node.create({
  name: 'paintPad',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      strokes: {
        default: PAINT_EMPTY_STROKES,
        parseHTML: (element) =>
          element.getAttribute('data-strokes') ??
          element.querySelector('script[type="application/json"]')?.textContent ??
          PAINT_EMPTY_STROKES,
        renderHTML: (attributes) => ({
          'data-strokes': attributes.strokes ?? PAINT_EMPTY_STROKES,
        }),
      },
      background: {
        default: PAINT_DEFAULT_BG,
        parseHTML: (element) => element.getAttribute('data-background') ?? PAINT_DEFAULT_BG,
        renderHTML: (attributes) => ({
          'data-background': attributes.background ?? PAINT_DEFAULT_BG,
        }),
      },
      width: {
        default: PAINT_DEFAULT_WIDTH,
        parseHTML: (element) => {
          const raw = Number(element.getAttribute('data-width'))
          return Number.isFinite(raw) && raw > 0 ? raw : PAINT_DEFAULT_WIDTH
        },
        renderHTML: (attributes) => ({
          'data-width': String(attributes.width ?? PAINT_DEFAULT_WIDTH),
        }),
      },
      height: {
        default: PAINT_DEFAULT_HEIGHT,
        parseHTML: (element) => {
          const raw = Number(element.getAttribute('data-height'))
          return Number.isFinite(raw) && raw > 0 ? raw : PAINT_DEFAULT_HEIGHT
        },
        renderHTML: (attributes) => ({
          'data-height': String(attributes.height ?? PAINT_DEFAULT_HEIGHT),
        }),
      },
      ocrText: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-ocr') ?? '',
        renderHTML: (attributes) => {
          const text = String(attributes.ocrText ?? '').trim()
          return text ? { 'data-ocr': text } : {}
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="paint-pad"]' }, { tag: 'figure[data-type="paint-pad"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const strokes = String(node.attrs.strokes ?? PAINT_EMPTY_STROKES)
    const ocr = String(node.attrs.ocrText ?? '').trim()
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'paint-pad', class: 'paint-block' }),
      ['script', { type: 'application/json' }, strokes],
      ...(ocr ? [['p', { class: 'paint-block__ocr' }, ocr] as const] : []),
    ]
  },

  addCommands() {
    return {
      insertPaintPad:
        (options) =>
        ({ editor, tr }) => {
          const from = options?.pos ?? editor.state.selection.from
          tr.replaceWith(
            from,
            from,
            this.type.create({
              strokes: options?.strokes ?? PAINT_EMPTY_STROKES,
              background: options?.background ?? PAINT_DEFAULT_BG,
              width: options?.width ?? PAINT_DEFAULT_WIDTH,
              height: options?.height ?? PAINT_DEFAULT_HEIGHT,
              ocrText: options?.ocrText ?? '',
            }),
          )
          return true
        },
      updatePaintPad:
        (options) =>
        ({ editor, tr }) => {
          const pos = options?.pos ?? editor.state.selection.from
          const node = editor.state.doc.nodeAt(pos)
          if (!node || node.type.name !== this.name) return false
          tr.setNodeMarkup(pos, this.type, {
            ...node.attrs,
            strokes: options?.strokes ?? node.attrs.strokes,
            background: options?.background ?? node.attrs.background,
            width: options?.width ?? node.attrs.width,
            height: options?.height ?? node.attrs.height,
            ocrText:
              options?.ocrText === null ? '' : (options?.ocrText ?? node.attrs.ocrText),
          })
          return true
        },
      deletePaintPad:
        (options) =>
        ({ editor, tr }) => {
          const pos = options?.pos ?? editor.state.selection.from
          const node = editor.state.doc.nodeAt(pos)
          if (!node || node.type.name !== this.name) return false
          tr.delete(pos, pos + node.nodeSize)
          return true
        },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(PaintBlock)
  },
})
