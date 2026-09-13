import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { LottieBlock } from '@/components/editor/LottieBlock'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lottieAnimation: {
      insertLottieAnimation: (options?: {
        src?: string | null
        caption?: string | null
        width?: string
        align?: string
        loop?: boolean
        autoplay?: boolean
        pos?: number
      }) => ReturnType
      updateLottieAnimation: (options?: {
        src?: string | null
        caption?: string | null
        width?: string
        align?: string
        loop?: boolean
        autoplay?: boolean
        pos?: number
      }) => ReturnType
      deleteLottieAnimation: (options?: { pos?: number }) => ReturnType
    }
  }
}

export const LottieAnimation = Node.create({
  name: 'lottieAnimation',
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
      loop: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-loop') !== 'false',
        renderHTML: (attributes) => ({
          'data-loop': attributes.loop === false ? 'false' : 'true',
        }),
      },
      autoplay: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-autoplay') !== 'false',
        renderHTML: (attributes) => ({
          'data-autoplay': attributes.autoplay === false ? 'false' : 'true',
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="lottie-animation"]' }, { tag: 'figure[data-type="lottie-animation"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const caption = node.attrs.caption ? String(node.attrs.caption) : ''
    const attrs = mergeAttributes(HTMLAttributes, {
      'data-type': 'lottie-animation',
      'data-src': node.attrs.src ?? '',
      class: 'lottie-animation',
    })
    if (caption) {
      return ['figure', attrs, ['div', { class: 'lottie-animation__media' }], ['figcaption', {}, caption]]
    }
    return ['figure', attrs, ['div', { class: 'lottie-animation__media' }]]
  },

  addCommands() {
    return {
      insertLottieAnimation:
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
              loop: options?.loop ?? true,
              autoplay: options?.autoplay ?? true,
            }),
          )
          return true
        },
      updateLottieAnimation:
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
            ...(options?.loop !== undefined ? { loop: options.loop } : {}),
            ...(options?.autoplay !== undefined ? { autoplay: options.autoplay } : {}),
          })
          return true
        },
      deleteLottieAnimation:
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
    return ReactNodeViewRenderer(LottieBlock)
  },
})
