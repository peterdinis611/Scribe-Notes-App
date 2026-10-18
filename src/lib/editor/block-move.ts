import type { Editor } from '@tiptap/react'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { ResolvedPos } from '@tiptap/pm/model'

export type BlockRange = {
  node: PMNode
  start: number
  end: number
  depth: number
}

const MOVABLE_TOP_LEVEL = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'bulletList',
  'orderedList',
  'taskList',
  'table',
  'image',
  'youtube',
  'video',
  'details',
  'pageBreak',
  'mathBlock',
  'mermaidDiagram',
  'd3Chart',
  'leafletMap',
  'lottieAnimation',
])

export function getBlockRangeAtPos($from: ResolvedPos): BlockRange | null {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    const name = node.type.name

    if (name === 'listItem' || name === 'taskItem') {
      const start = $from.before(depth)
      return { node, start, end: start + node.nodeSize, depth }
    }
  }

  for (let depth = 1; depth <= $from.depth; depth += 1) {
    const node = $from.node(depth)
    if (depth === 1 && MOVABLE_TOP_LEVEL.has(node.type.name)) {
      const start = $from.before(depth)
      return { node, start, end: start + node.nodeSize, depth }
    }
  }

  if ($from.depth >= 1) {
    const depth = 1
    const node = $from.node(depth)
    if (node.type.name === 'doc') return null
    const start = $from.before(depth)
    return { node, start, end: start + node.nodeSize, depth }
  }

  return null
}

export function getActiveBlockRange(editor: Editor): BlockRange | null {
  return getBlockRangeAtPos(editor.state.selection.$from)
}
