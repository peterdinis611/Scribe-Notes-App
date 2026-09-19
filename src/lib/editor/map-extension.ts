import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { MapBlock } from '@/components/editor/MapBlock'
import { MAP_DEFAULT_SOURCE } from '@/lib/editor/map'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    leafletMap: {
      insertLeafletMap: (options?: { source?: string; pos?: number }) => ReturnType
      updateLeafletMap: (options?: { source?: string; pos?: number }) => ReturnType
      deleteLeafletMap: (options?: { pos?: number }) => ReturnType
    }
  }
}

export const LeafletMap = Node.create({
  name: 'leafletMap',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      source: {
        default: MAP_DEFAULT_SOURCE,
        parseHTML: (element) =>
          element.getAttribute('data-source') ??
          element.querySelector('pre')?.textContent ??
          MAP_DEFAULT_SOURCE,
        renderHTML: (attributes) => ({
          'data-source': attributes.source,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="leaflet-map"]' }, { tag: 'figure[data-type="leaflet-map"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'leaflet-map', class: 'map-block' }),
      ['pre', {}, String(node.attrs.source ?? '')],
    ]
  },

  addCommands() {
    return {
      insertLeafletMap:
        (options) =>
        ({ editor, tr }) => {
          const source = (options?.source ?? MAP_DEFAULT_SOURCE).trim() || MAP_DEFAULT_SOURCE
          const from = options?.pos ?? editor.state.selection.from
          tr.replaceWith(from, from, this.type.create({ source }))
          return true
        },
      updateLeafletMap:
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
      deleteLeafletMap:
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
    return ReactNodeViewRenderer(MapBlock)
  },
})
