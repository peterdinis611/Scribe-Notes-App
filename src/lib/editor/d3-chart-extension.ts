import { mergeAttributes, Node } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import i18n from '@/i18n'
import { D3_CHART_DEFAULT_SOURCE, renderD3ChartSource } from '@/lib/editor/d3-chart'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    d3Chart: {
      insertD3Chart: (options?: { source?: string; pos?: number }) => ReturnType
      updateD3Chart: (options?: { source?: string; pos?: number }) => ReturnType
      deleteD3Chart: (options?: { pos?: number }) => ReturnType
    }
  }
}

function stopEditorKeys(event: Event) {
  event.stopPropagation()
}

function createD3ChartNodeView() {
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
    let themeObserver: MutationObserver | null = null

    const wrapper = document.createElement('div')
    wrapper.className = 'd3-chart'
    wrapper.dataset.type = 'd3-chart'
    if (editor.isEditable) {
      wrapper.classList.add('d3-chart--editable')
    }

    const toolbar = document.createElement('div')
    toolbar.className = 'd3-chart__toolbar'
    if (!editor.isEditable) {
      toolbar.hidden = true
    }

    const editBtn = document.createElement('button')
    editBtn.type = 'button'
    editBtn.className = 'd3-chart__btn'
    editBtn.textContent = i18n.t('d3Chart.edit')
    editBtn.title = i18n.t('d3Chart.editTitle')

    const preview = document.createElement('div')
    preview.className = 'd3-chart__preview'

    const sourceArea = document.createElement('textarea')
    sourceArea.className = 'd3-chart__source'
    sourceArea.spellcheck = false
    sourceArea.rows = 12
    sourceArea.hidden = true

    const actions = document.createElement('div')
    actions.className = 'd3-chart__actions'
    actions.hidden = true

    const doneBtn = document.createElement('button')
    doneBtn.type = 'button'
    doneBtn.className = 'd3-chart__btn d3-chart__btn--primary'
    doneBtn.textContent = i18n.t('d3Chart.done')

    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'd3-chart__btn'
    cancelBtn.textContent = i18n.t('d3Chart.cancel')

    toolbar.appendChild(editBtn)
    actions.append(doneBtn, cancelBtn)
    wrapper.append(toolbar, preview, sourceArea, actions)

    const setSourceOnNode = (source: string) => {
      const pos = getPos()
      if (pos == null) return
      editor.chain().focus().updateD3Chart({ source, pos }).run()
    }

    const renderPreview = (source: string) => {
      preview.classList.remove('d3-chart__preview--error')
      const result = renderD3ChartSource(source)
      if (result.ok) {
        preview.innerHTML = result.svg
        const svg = preview.querySelector('svg')
        if (svg) {
          svg.removeAttribute('height')
          svg.style.maxWidth = '100%'
          svg.style.height = 'auto'
        }
      } else {
        preview.classList.add('d3-chart__preview--error')
        preview.textContent = result.error
      }
    }

    const enterEdit = () => {
      if (!editor.isEditable || editing) return
      editing = true
      wrapper.classList.add('d3-chart--editing')
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
      wrapper.classList.remove('d3-chart--editing')
      sourceArea.hidden = true
      actions.hidden = true
      editBtn.hidden = false
      preview.hidden = false

      if (commit) {
        const next = sourceArea.value.trim() || D3_CHART_DEFAULT_SOURCE
        currentSource = next
        wrapper.dataset.source = next
        setSourceOnNode(next)
        renderPreview(next)
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
      if (!editing) renderPreview(currentSource)
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    wrapper.dataset.source = currentSource
    renderPreview(currentSource)

    return {
      dom: wrapper,
      ignoreMutation: () => true,
      selectNode: () => {
        wrapper.classList.add('d3-chart--selected')
      },
      deselectNode: () => {
        wrapper.classList.remove('d3-chart--selected')
      },
      update(updatedNode: PMNode) {
        if (updatedNode.type.name !== 'd3Chart') return false
        const next = String(updatedNode.attrs.source ?? '')
        if (next !== currentSource && !editing) {
          currentSource = next
          wrapper.dataset.source = next
          renderPreview(next)
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

export const D3Chart = Node.create({
  name: 'd3Chart',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      source: {
        default: D3_CHART_DEFAULT_SOURCE,
        parseHTML: (element) =>
          element.getAttribute('data-source') ??
          element.querySelector('pre')?.textContent ??
          D3_CHART_DEFAULT_SOURCE,
        renderHTML: (attributes) => ({
          'data-source': attributes.source,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="d3-chart"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'd3-chart', class: 'd3-chart' }),
      ['pre', {}, String(node.attrs.source ?? '')],
    ]
  },

  addCommands() {
    return {
      insertD3Chart:
        (options) =>
        ({ editor, tr }) => {
          const source = (options?.source ?? D3_CHART_DEFAULT_SOURCE).trim() || D3_CHART_DEFAULT_SOURCE
          const from = options?.pos ?? editor.state.selection.from
          tr.replaceWith(from, from, this.type.create({ source }))
          return true
        },
      updateD3Chart:
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
      deleteD3Chart:
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
    return createD3ChartNodeView()
  },
})
