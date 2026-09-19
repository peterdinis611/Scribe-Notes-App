import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import Youtube from '@tiptap/extension-youtube'
import { VideoBlock } from '@/components/editor/VideoBlock'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    video: {
      insertVideo: (options?: { src?: string | null; caption?: string | null; pos?: number }) => ReturnType
      updateVideo: (options?: { src?: string | null; caption?: string | null; pos?: number }) => ReturnType
      deleteVideo: (options?: { pos?: number }) => ReturnType
    }
  }
}

export const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-src') ??
          element.querySelector('iframe, video, a')?.getAttribute('src') ??
          element.querySelector('a')?.getAttribute('href') ??
          null,
      },
      caption: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-caption') ?? element.querySelector('figcaption')?.textContent ?? null,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="video"]' }, { tag: 'figure[data-type="video"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const caption = node.attrs.caption ? String(node.attrs.caption) : ''
    const attrs = mergeAttributes(HTMLAttributes, {
      'data-type': 'video',
      'data-src': node.attrs.src ?? '',
      class: 'video-block',
    })
    if (caption) {
      return ['figure', attrs, ['div', { class: 'video-block__stage' }], ['figcaption', {}, caption]]
    }
    return ['figure', attrs, ['div', { class: 'video-block__stage' }]]
  },

  addCommands() {
    return {
      insertVideo:
        (options) =>
        ({ editor, tr }) => {
          const from = options?.pos ?? editor.state.selection.from
          tr.replaceWith(
            from,
            from,
            this.type.create({
              src: options?.src ?? null,
              caption: options?.caption ?? null,
            }),
          )
          return true
        },
      updateVideo:
        (options) =>
        ({ editor, tr }) => {
          const pos = options?.pos ?? editor.state.selection.from
          const node = editor.state.doc.nodeAt(pos)
          if (!node || node.type.name !== this.name) return false
          tr.setNodeMarkup(pos, this.type, {
            ...node.attrs,
            ...(options?.src !== undefined ? { src: options.src } : {}),
            ...(options?.caption !== undefined ? { caption: options.caption } : {}),
          })
          return true
        },
      deleteVideo:
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
    return ReactNodeViewRenderer(VideoBlock)
  },
})

/** Existing YouTube nodes play through the same React Player view. */
export const YoutubeWithPlayer = Youtube.extend({
  addNodeView() {
    return ReactNodeViewRenderer(VideoBlock)
  },
})
