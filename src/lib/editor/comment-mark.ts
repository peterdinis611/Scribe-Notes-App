import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      setComment: (attrs: { text: string }) => ReturnType
      unsetComment: () => ReturnType
    }
  }
}

export const CommentMark = Mark.create({
  name: 'comment',

  inclusive: false,

  addAttributes() {
    return {
      text: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-comment') ?? '',
        renderHTML: (attributes) => ({
          'data-comment': attributes.text,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'editor-comment',
        title: HTMLAttributes['data-comment'],
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setComment:
        (attrs) =>
        ({ chain }) =>
          chain().setMark(this.name, attrs).run(),
      unsetComment:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
    }
  },
})
