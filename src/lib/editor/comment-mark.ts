import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      /** Anchor the current selection to a comment thread. */
      setComment: (attrs: { commentId: string; resolved?: boolean }) => ReturnType
      unsetComment: () => ReturnType
      /** Toggle resolved styling for every mark belonging to a thread. */
      setCommentResolved: (attrs: { commentId: string; resolved: boolean }) => ReturnType
      /** Remove every mark belonging to a thread (used when the thread is deleted). */
      removeCommentById: (attrs: { commentId: string }) => ReturnType
    }
  }
}

export const CommentMark = Mark.create({
  name: 'comment',

  inclusive: false,

  excludes: '',

  addAttributes() {
    return {
      // Legacy inline note text (documents created before threaded comments).
      text: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-comment') ?? '',
        renderHTML: (attributes) =>
          attributes.text ? { 'data-comment': attributes.text } : {},
      },
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-comment-id'),
        renderHTML: (attributes) =>
          attributes.commentId ? { 'data-comment-id': attributes.commentId } : {},
      },
      resolved: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-comment-resolved') === 'true',
        renderHTML: (attributes) =>
          attributes.resolved ? { 'data-comment-resolved': 'true' } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment]' }, { tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: HTMLAttributes['data-comment-resolved']
          ? 'editor-comment editor-comment--resolved'
          : 'editor-comment',
        title: HTMLAttributes['data-comment'] ?? undefined,
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setComment:
        (attrs) =>
        ({ chain }) =>
          chain()
            .setMark(this.name, { commentId: attrs.commentId, resolved: attrs.resolved ?? false })
            .run(),
      unsetComment:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
      setCommentResolved:
        (attrs) =>
        ({ state, tr, dispatch }) => {
          const markType = state.schema.marks[this.name]
          if (!markType) return false
          let changed = false
          state.doc.descendants((node, pos) => {
            if (!node.isText) return
            const mark = node.marks.find(
              (m) => m.type === markType && m.attrs.commentId === attrs.commentId,
            )
            if (!mark) return
            const from = pos
            const to = pos + node.nodeSize
            tr.removeMark(from, to, markType)
            tr.addMark(
              from,
              to,
              markType.create({ ...mark.attrs, resolved: attrs.resolved }),
            )
            changed = true
          })
          if (changed && dispatch) dispatch(tr)
          return changed
        },
      removeCommentById:
        (attrs) =>
        ({ state, tr, dispatch }) => {
          const markType = state.schema.marks[this.name]
          if (!markType) return false
          let changed = false
          state.doc.descendants((node, pos) => {
            if (!node.isText) return
            const mark = node.marks.find(
              (m) => m.type === markType && m.attrs.commentId === attrs.commentId,
            )
            if (!mark) return
            tr.removeMark(pos, pos + node.nodeSize, markType)
            changed = true
          })
          if (changed && dispatch) dispatch(tr)
          return changed
        },
    }
  },
})
