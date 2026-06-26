import type { Editor } from '@tiptap/react'
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { TableOfContentsView } from '@/components/editor/TableOfContentsView'

export type HeadingEntry = {
  level: number
  text: string
  pos: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableOfContents: {
      insertTableOfContents: (options?: { maxLevel?: number }) => ReturnType
    }
  }
}

export function collectHeadingEntries(editor: Editor | null, maxLevel = 3): HeadingEntry[] {
  if (!editor) return []

  const items: HeadingEntry[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    const level = Number(node.attrs.level ?? 1)
    if (level > maxLevel) return
    const text = node.textContent.trim()
    if (!text) return
    items.push({ level, text, pos })
  })
  return items
}

export const TableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      maxLevel: {
        default: 3,
        parseHTML: (element) => Number(element.getAttribute('data-max-level') ?? 3),
        renderHTML: (attributes) => ({
          'data-max-level': attributes.maxLevel,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'nav[data-table-of-contents]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'nav',
      mergeAttributes(HTMLAttributes, {
        'data-table-of-contents': '',
        class: 'table-of-contents-block',
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsView)
  },

  addCommands() {
    return {
      insertTableOfContents:
        (options) =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              attrs: { maxLevel: options?.maxLevel ?? 3 },
            })
            .run(),
    }
  },
})
