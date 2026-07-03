import { mergeAttributes, Node } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `fn-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      /** Insert a footnote reference at the cursor and open its editor. */
      insertFootnote: (content?: string) => ReturnType
    }
  }
}

type FootnoteOptions = {
  onEdit?: (editor: Editor, pos: number, content: string) => void
}

export const Footnote = Node.create<FootnoteOptions>({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { onEdit: undefined }
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-footnote-id'),
        renderHTML: (attributes) =>
          attributes.id ? { 'data-footnote-id': attributes.id } : {},
      },
      content: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-footnote') ?? '',
        renderHTML: (attributes) => ({ 'data-footnote': attributes.content ?? '' }),
      },
      number: {
        default: 0,
        parseHTML: (element) => Number(element.getAttribute('data-footnote-number')) || 0,
        renderHTML: (attributes) => ({ 'data-footnote-number': String(attributes.number ?? 0) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, { class: 'footnote-ref' }),
      `${node.attrs.number || ''}`,
    ]
  },

  renderText({ node }) {
    return `[^${node.attrs.number || ''}]`
  },

  addCommands() {
    return {
      insertFootnote:
        (content = '') =>
        ({ chain, editor }) => {
          const id = generateId()
          return chain()
            .insertContent({ type: this.name, attrs: { id, content, number: 0 } })
            .command(() => {
              if (!content.trim()) {
                const pos = editor.state.selection.from - 1
                queueMicrotask(() => this.options.onEdit?.(editor, pos, ''))
              }
              return true
            })
            .run()
        },
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('sup')
      dom.className = 'footnote-ref'

      const render = (current: PMNode) => {
        dom.textContent = String(current.attrs.number || '?')
        dom.title = current.attrs.content || 'Prázdna poznámka — kliknite pre úpravu'
        if (current.attrs.id) dom.setAttribute('data-footnote-id', current.attrs.id)
      }

      const handleClick = (event: Event) => {
        if (!editor.isEditable) return
        event.preventDefault()
        event.stopPropagation()
        const pos = getPos()
        if (pos == null) return
        const current = editor.state.doc.nodeAt(pos)
        if (!current) return
        this.options.onEdit?.(editor, pos, String(current.attrs.content ?? ''))
      }

      dom.addEventListener('click', handleClick)
      render(node)

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'footnote') return false
          render(updated)
          return true
        },
        destroy() {
          dom.removeEventListener('click', handleClick)
        },
      }
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    const onEdit = this.options.onEdit

    return [
      new Plugin({
        key: new PluginKey('footnoteManager'),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null
          let index = 0
          const updates: Array<{ pos: number; number: number }> = []
          newState.doc.descendants((node, pos) => {
            if (node.type.name === 'footnote') {
              index += 1
              if (node.attrs.number !== index) updates.push({ pos, number: index })
            }
          })
          if (!updates.length) return null
          const tr = newState.tr
          for (const { pos, number } of updates) {
            const node = newState.doc.nodeAt(pos)
            if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, number })
          }
          tr.setMeta('addToHistory', false)
          return tr
        },
        props: {
          decorations(state) {
            const items: Array<{ id: string; number: number; content: string }> = []
            state.doc.descendants((node) => {
              if (node.type.name === 'footnote') {
                items.push({
                  id: node.attrs.id ?? '',
                  number: node.attrs.number || items.length + 1,
                  content: node.attrs.content ?? '',
                })
              }
            })
            if (!items.length) return DecorationSet.empty

            const widget = Decoration.widget(
              state.doc.content.size,
              (view: EditorView) => buildFootnotesSection(view, editor, onEdit, items),
              { side: 1, key: `footnotes-${items.map((i) => `${i.number}:${i.content}`).join('|')}` },
            )
            return DecorationSet.create(state.doc, [widget])
          },
        },
      }),
    ]
  },
})

function buildFootnotesSection(
  _view: EditorView,
  editor: Editor,
  onEdit: FootnoteOptions['onEdit'],
  items: Array<{ id: string; number: number; content: string }>,
): HTMLElement {
  const section = document.createElement('div')
  section.className = 'footnotes-section'
  section.contentEditable = 'false'

  const heading = document.createElement('div')
  heading.className = 'footnotes-heading'
  heading.textContent = 'Poznámky pod čiarou'
  section.appendChild(heading)

  const list = document.createElement('ol')
  list.className = 'footnotes-list'

  for (const item of items) {
    const li = document.createElement('li')
    li.className = 'footnotes-item'
    li.value = item.number
    if (item.id) li.setAttribute('data-footnote-id', item.id)

    const text = document.createElement('span')
    text.className = 'footnotes-item-text'
    text.textContent = item.content || '(prázdna poznámka)'
    if (!item.content) text.classList.add('footnotes-item-text--empty')
    li.appendChild(text)

    li.addEventListener('mousedown', (event) => {
      event.preventDefault()
      if (item.id) {
        document
          .querySelector(`.footnote-ref[data-footnote-id="${item.id}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })

    if (editor.isEditable && onEdit) {
      const edit = document.createElement('button')
      edit.type = 'button'
      edit.className = 'footnotes-item-edit'
      edit.textContent = 'Upraviť'
      edit.addEventListener('mousedown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        let pos: number | null = null
        editor.state.doc.descendants((node, nodePos) => {
          if (pos != null) return false
          if (node.type.name === 'footnote' && node.attrs.id === item.id) pos = nodePos
        })
        if (pos != null) onEdit(editor, pos, item.content)
      })
      li.appendChild(edit)
    }

    list.appendChild(li)
  }

  section.appendChild(list)
  return section
}

/** Prompt-based editor for footnote content, wired via the extension options. */
export function createFootnoteEditHandler() {
  return (editor: Editor, pos: number, content: string) => {
    const next = window.prompt('Text poznámky pod čiarou', content)
    if (next === null) return
    const trimmed = next.trim()
    const node = editor.state.doc.nodeAt(pos)
    if (!node || node.type.name !== 'footnote') return
    if (!trimmed) {
      editor.chain().focus().command(({ tr }) => {
        tr.delete(pos, pos + node.nodeSize)
        return true
      }).run()
      return
    }
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, content: trimmed })
        return true
      })
      .run()
  }
}
