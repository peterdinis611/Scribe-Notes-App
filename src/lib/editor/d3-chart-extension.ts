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

    toolbar.appendChild(editBtn)
    wrapper.append(toolbar, preview)

    const setSourceOnNode = (source: string) => {
      const pos = getPos()
      if (pos == null) return
      editor.chain().focus().updateD3Chart({ source, pos }).run()
    }

    const deleteNode = () => {
      const pos = getPos()
      if (pos == null) return
      editor.chain().focus().deleteD3Chart({ pos }).run()
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

    const openBuilder = () => {
      if (!editor.isEditable) return
      void (async () => {
        const { promptChartDialog } = await import('@/lib/chart-dialog')
        const next = await promptChartDialog({
          intent: 'edit',
          initialSource: currentSource,
        })
        if (next === null || editor.isDestroyed) return
        if (next.clear || !next.source.trim()) {
          deleteNode()
          return
        }
        const source = next.source.trim() || D3_CHART_DEFAULT_SOURCE
        currentSource = source
        wrapper.dataset.source = source
        setSourceOnNode(source)
        renderPreview(source)
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
      renderPreview(currentSource)
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
        if (next !== currentSource) {
          currentSource = next
          wrapper.dataset.source = next
          renderPreview(next)
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
