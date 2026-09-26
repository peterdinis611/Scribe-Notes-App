import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { Model3dBlock } from '@/components/editor/Model3dBlock'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    model3d: {
      insertModel3d: (options?: {
        src?: string | null
        caption?: string | null
        width?: string
        align?: string
        autoRotate?: boolean
        cameraControls?: boolean
        poster?: string | null
        pos?: number
      }) => ReturnType
      updateModel3d: (options?: {
        src?: string | null
        caption?: string | null
        width?: string
        align?: string
        autoRotate?: boolean
        cameraControls?: boolean
        poster?: string | null
        pos?: number
      }) => ReturnType
      deleteModel3d: (options?: { pos?: number }) => ReturnType
    }
  }
}

export const Model3d = Node.create({
  name: 'model3d',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-src') ?? element.getAttribute('src'),
      },
      caption: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-caption') ??
          element.querySelector('figcaption')?.textContent ??
          null,
      },
      width: {
        default: '480px',
        parseHTML: (element) => element.getAttribute('data-width') ?? '480px',
        renderHTML: (attributes) =>
          attributes.width ? { 'data-width': attributes.width } : {},
      },
      align: {
        default: 'center',
        parseHTML: (element) => element.getAttribute('data-align') ?? 'center',
        renderHTML: (attributes) => ({
          'data-align': attributes.align ?? 'center',
        }),
      },
      autoRotate: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-auto-rotate') !== 'false',
        renderHTML: (attributes) => ({
          'data-auto-rotate': attributes.autoRotate === false ? 'false' : 'true',
        }),
      },
      cameraControls: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-camera-controls') !== 'false',
        renderHTML: (attributes) => ({
          'data-camera-controls': attributes.cameraControls === false ? 'false' : 'true',
        }),
      },
      poster: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-poster'),
        renderHTML: (attributes) =>
          attributes.poster ? { 'data-poster': attributes.poster } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="model-3d"]' }, { tag: 'figure[data-type="model-3d"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const caption = node.attrs.caption ? String(node.attrs.caption) : ''
    const attrs = mergeAttributes(HTMLAttributes, {
      'data-type': 'model-3d',
      'data-src': node.attrs.src ?? '',
      class: 'model-3d',
    })
    if (caption) {
      return ['figure', attrs, ['div', { class: 'model-3d__media' }], ['figcaption', {}, caption]]
    }
    return ['figure', attrs, ['div', { class: 'model-3d__media' }]]
  },

  addCommands() {
    return {
      insertModel3d:
        (options) =>
        ({ editor, tr }) => {
          const from = options?.pos ?? editor.state.selection.from
          tr.replaceWith(
            from,
            from,
            this.type.create({
              src: options?.src ?? null,
              caption: options?.caption ?? null,
              width: options?.width ?? '480px',
              align: options?.align ?? 'center',
              autoRotate: options?.autoRotate ?? true,
              cameraControls: options?.cameraControls ?? true,
              poster: options?.poster ?? null,
            }),
          )
          return true
        },
      updateModel3d:
        (options) =>
        ({ editor, tr }) => {
          const pos = options?.pos ?? editor.state.selection.from
          const node = editor.state.doc.nodeAt(pos)
          if (!node || node.type.name !== this.name) return false
          tr.setNodeMarkup(pos, this.type, {
            ...node.attrs,
            ...(options?.src !== undefined ? { src: options.src } : {}),
            ...(options?.caption !== undefined ? { caption: options.caption } : {}),
            ...(options?.width !== undefined ? { width: options.width } : {}),
            ...(options?.align !== undefined ? { align: options.align } : {}),
            ...(options?.autoRotate !== undefined ? { autoRotate: options.autoRotate } : {}),
            ...(options?.cameraControls !== undefined
              ? { cameraControls: options.cameraControls }
              : {}),
            ...(options?.poster !== undefined ? { poster: options.poster } : {}),
          })
          return true
        },
      deleteModel3d:
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
    return ReactNodeViewRenderer(Model3dBlock)
  },
})
