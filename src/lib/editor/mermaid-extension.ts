import { mergeAttributes, Node } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import i18n from '@/i18n'
import { MERMAID_DEFAULT_SOURCE, renderMermaidSource } from '@/lib/editor/mermaid'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mermaidDiagram: {
      insertMermaidDiagram: (options?: { source?: string; pos?: number }) => ReturnType
      updateMermaidDiagram: (options?: { source?: string; pos?: number }) => ReturnType
      deleteMermaidDiagram: (options?: { pos?: number }) => ReturnType
    }
  }
}

function createMermaidNodeView() {
  return ({
    node,
    getPos,
    editor,
  }: {
    node: PMNode
    getPos: () => number | undefined
    editor: Editor
  }) => {
    let currentSource = String(node.attrs.source ?? '')
    let renderToken = 0
    let themeObserver: MutationObserver | null = null

    const wrapper = document.createElement('div')
    wrapper.className = 'mermaid-diagram'
    wrapper.dataset.type = 'mermaid-diagram'
    if (editor.isEditable) {
      wrapper.classList.add('mermaid-diagram--editable')
    }

    const toolbar = document.createElement('div')
    toolbar.className = 'mermaid-diagram__toolbar'
    if (!editor.isEditable) {
      toolbar.hidden = true
    }

    const editBtn = document.createElement('button')
    editBtn.type = 'button'
    editBtn.className = 'mermaid-diagram__btn'
    editBtn.textContent = i18n.t('mermaid.edit')
    editBtn.title = i18n.t('mermaid.editTitle')

    const preview = document.createElement('div')
    preview.className = 'mermaid-diagram__preview'

    toolbar.appendChild(editBtn)
    wrapper.append(toolbar, preview)

    const setSourceOnNode = (source: string) => {
      const pos = getPos()
      if (pos == null) return
      editor.chain().focus().updateMermaidDiagram({ source, pos }).run()
    }

    const deleteNode = () => {
      const pos = getPos()
      if (pos == null) return
      editor.chain().focus().deleteMermaidDiagram({ pos }).run()
    }

    const renderPreview = async (source: string) => {
      const token = ++renderToken
      preview.classList.remove('mermaid-diagram__preview--error')
      preview.textContent = i18n.t('mermaid.rendering')

      const result = await renderMermaidSource(source)
      if (token !== renderToken) return

      if (result.ok) {
        preview.innerHTML = result.svg
        const svg = preview.querySelector('svg')
        if (svg) {
          svg.removeAttribute('height')
          svg.style.maxWidth = '100%'
          svg.style.height = 'auto'
        }
      } else {
        preview.classList.add('mermaid-diagram__preview--error')
        preview.textContent = result.error
      }
    }

    const openBuilder = () => {
      if (!editor.isEditable) return
      void (async () => {
        const { promptMermaidDialog } = await import('@/lib/mermaid-dialog')
        const next = await promptMermaidDialog({
          intent: 'edit',
          initialSource: currentSource,
        })
        if (next === null || editor.isDestroyed) return
        if (next.clear || !next.source.trim()) {
          deleteNode()
          return
        }
        const source = next.source.trim() || MERMAID_DEFAULT_SOURCE
        currentSource = source
        wrapper.dataset.source = source
        setSourceOnNode(source)
        void renderPreview(source)
      })()
    }

    const onEditClick = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      openBuilder()
    }

    const onDoubleClick = (event: Event) => {
      if (!editor.isEditable) return
      event.preventDefault()
      event.stopPropagation()
      openBuilder()
    }

    editBtn.addEventListener('click', onEditClick)
    wrapper.addEventListener('dblclick', onDoubleClick)

    themeObserver = new MutationObserver(() => {
      void renderPreview(currentSource)
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    wrapper.dataset.source = currentSource
    void renderPreview(currentSource)

    return {
      dom: wrapper,
      ignoreMutation: () => true,
      selectNode: () => {
        wrapper.classList.add('mermaid-diagram--selected')
      },
      deselectNode: () => {
        wrapper.classList.remove('mermaid-diagram--selected')
      },
      update(updatedNode: PMNode) {
        if (updatedNode.type.name !== 'mermaidDiagram') return false
        const next = String(updatedNode.attrs.source ?? '')
        if (next !== currentSource) {
          currentSource = next
          wrapper.dataset.source = next
          void renderPreview(next)
        }
        return true
      },
      destroy() {
        themeObserver?.disconnect()
        editBtn.removeEventListener('click', onEditClick)
        wrapper.removeEventListener('dblclick', onDoubleClick)
      },
    }
  }
}

export const MermaidDiagram = Node.create({
  name: 'mermaidDiagram',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      source: {
        default: MERMAID_DEFAULT_SOURCE,
        parseHTML: (element) =>
          element.getAttribute('data-source') ??
          element.querySelector('pre')?.textContent ??
          MERMAID_DEFAULT_SOURCE,
        renderHTML: (attributes) => ({
          'data-source': attributes.source,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid-diagram"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'mermaid-diagram', class: 'mermaid-diagram' }),
      ['pre', {}, String(node.attrs.source ?? '')],
    ]
  },

  addCommands() {
    return {
      insertMermaidDiagram:
        (options) =>
        ({ editor, tr }) => {
          const source = (options?.source ?? MERMAID_DEFAULT_SOURCE).trim() || MERMAID_DEFAULT_SOURCE
          const from = options?.pos ?? editor.state.selection.from
          tr.replaceWith(from, from, this.type.create({ source }))
          return true
        },
      updateMermaidDiagram:
        (options) =>
        ({ editor, tr }) => {
          const pos = options?.pos ?? editor.state.selection.from
          const node = editor.state.doc.nodeAt(pos)
          if (!node || node.type.name !== this.name) return false
          tr.setNodeMarkup(pos, this.type, {
            ...node.attrs,
            source: options?.source ?? node.attrs.source,
          })
          return true
        },
      deleteMermaidDiagram:
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
    return createMermaidNodeView()
  },
})
