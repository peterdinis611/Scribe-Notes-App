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

function stopEditorKeys(event: Event) {
  event.stopPropagation()
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
    let editing = false
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

    const sourceArea = document.createElement('textarea')
    sourceArea.className = 'mermaid-diagram__source'
    sourceArea.spellcheck = false
    sourceArea.rows = 8
    sourceArea.hidden = true

    const actions = document.createElement('div')
    actions.className = 'mermaid-diagram__actions'
    actions.hidden = true

    const doneBtn = document.createElement('button')
    doneBtn.type = 'button'
    doneBtn.className = 'mermaid-diagram__btn mermaid-diagram__btn--primary'
    doneBtn.textContent = i18n.t('mermaid.done')

    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'mermaid-diagram__btn'
    cancelBtn.textContent = i18n.t('mermaid.cancel')

    toolbar.appendChild(editBtn)
    actions.append(doneBtn, cancelBtn)
    wrapper.append(toolbar, preview, sourceArea, actions)

    const setSourceOnNode = (source: string) => {
      const pos = getPos()
      if (pos == null) return
      editor.chain().focus().updateMermaidDiagram({ source, pos }).run()
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

    const enterEdit = () => {
      if (!editor.isEditable || editing) return
      editing = true
      wrapper.classList.add('mermaid-diagram--editing')
      sourceArea.value = currentSource
      sourceArea.hidden = false
      actions.hidden = false
      editBtn.hidden = true
      preview.hidden = true
      sourceArea.focus()
    }

    const exitEdit = (commit: boolean) => {
      if (!editing) return
      editing = false
      wrapper.classList.remove('mermaid-diagram--editing')
      sourceArea.hidden = true
      actions.hidden = true
      editBtn.hidden = false
      preview.hidden = false

      if (commit) {
        const next = sourceArea.value.trim() || MERMAID_DEFAULT_SOURCE
        currentSource = next
        wrapper.dataset.source = next
        setSourceOnNode(next)
        void renderPreview(next)
      } else {
        sourceArea.value = currentSource
      }
    }

    const onEditClick = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      enterEdit()
    }

    const onDoneClick = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      exitEdit(true)
    }

    const onCancelClick = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      exitEdit(false)
    }

    const onDoubleClick = (event: Event) => {
      if (!editor.isEditable || editing) return
      event.preventDefault()
      event.stopPropagation()
      enterEdit()
    }

    editBtn.addEventListener('click', onEditClick)
    doneBtn.addEventListener('click', onDoneClick)
    cancelBtn.addEventListener('click', onCancelClick)
    wrapper.addEventListener('dblclick', onDoubleClick)
    sourceArea.addEventListener('keydown', stopEditorKeys)
    sourceArea.addEventListener('keyup', stopEditorKeys)
    sourceArea.addEventListener('keypress', stopEditorKeys)
    sourceArea.addEventListener('beforeinput', stopEditorKeys)
    sourceArea.addEventListener('mousedown', stopEditorKeys)

    themeObserver = new MutationObserver(() => {
      if (!editing) void renderPreview(currentSource)
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
        if (next !== currentSource && !editing) {
          currentSource = next
          wrapper.dataset.source = next
          void renderPreview(next)
        }
        return true
      },
      destroy() {
        themeObserver?.disconnect()
        editBtn.removeEventListener('click', onEditClick)
        doneBtn.removeEventListener('click', onDoneClick)
        cancelBtn.removeEventListener('click', onCancelClick)
        wrapper.removeEventListener('dblclick', onDoubleClick)
        sourceArea.removeEventListener('keydown', stopEditorKeys)
        sourceArea.removeEventListener('keyup', stopEditorKeys)
        sourceArea.removeEventListener('keypress', stopEditorKeys)
        sourceArea.removeEventListener('beforeinput', stopEditorKeys)
        sourceArea.removeEventListener('mousedown', stopEditorKeys)
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
