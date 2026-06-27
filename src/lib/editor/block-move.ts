import type { Editor } from '@tiptap/react'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { ResolvedPos } from '@tiptap/pm/model'
import { EDITOR_PAGE } from '@/lib/editor/page-layout'

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
  'details',
  'pageBreak',
  'mathBlock',
])

function getOffsetTopWithin(element: HTMLElement, container: HTMLElement): number {
  let top = 0
  let node: HTMLElement | null = element

  while (node && node !== container) {
    top += node.offsetTop
    node = node.parentElement
  }

  if (node !== container) {
    const containerRect = container.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    return elementRect.top - containerRect.top
  }

  return top
}

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

export function canMoveBlockUp(editor: Editor): boolean {
  const block = getActiveBlockRange(editor)
  if (!block) return false

  const $pos = editor.state.doc.resolve(block.start)
  return $pos.index(block.depth - 1) > 0
}

export function canMoveBlockDown(editor: Editor): boolean {
  const block = getActiveBlockRange(editor)
  if (!block) return false

  const $pos = editor.state.doc.resolve(block.start)
  const parent = $pos.node(block.depth - 1)
  return $pos.index(block.depth - 1) < parent.childCount - 1
}

export function moveBlockUp(editor: Editor): boolean {
  const block = getActiveBlockRange(editor)
  if (!block) return false

  const $pos = editor.state.doc.resolve(block.start)
  const index = $pos.index(block.depth - 1)
  if (index === 0) return false

  const parent = $pos.node(block.depth - 1)
  const prevNode = parent.child(index - 1)
  const prevStart = block.start - prevNode.nodeSize

  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      const { node, start, end } = block
      tr.delete(start, end)
      tr.insert(tr.mapping.map(prevStart), node)
      return true
    })
    .run()
}

export function moveBlockDown(editor: Editor): boolean {
  const block = getActiveBlockRange(editor)
  if (!block) return false

  const $pos = editor.state.doc.resolve(block.start)
  const index = $pos.index(block.depth - 1)
  const parent = $pos.node(block.depth - 1)
  if (index >= parent.childCount - 1) return false

  const nextNode = parent.child(index + 1)
  const insertAfterNext = block.end + nextNode.nodeSize

  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      const { node, start, end } = block
      tr.delete(start, end)
      tr.insert(tr.mapping.map(insertAfterNext), node)
      return true
    })
    .run()
}

function findInsertPosForPage(editor: Editor, canvasEl: HTMLElement, targetPage: number): number {
  const { doc } = editor.state
  const view = editor.view
  const targetY = EDITOR_PAGE.paddingTop + (targetPage - 1) * EDITOR_PAGE.contentHeight
  let insertPos = doc.content.size

  doc.forEach((_node, offset) => {
    if (offset === 0) return

    const dom = view.nodeDOM(offset)
    if (!dom || !(dom instanceof HTMLElement)) return

    const top = getOffsetTopWithin(dom, canvasEl)
    if (top >= targetY && insertPos === doc.content.size) {
      insertPos = offset
    }
  })

  return insertPos
}

export function getBlockPage(editor: Editor, canvasEl: HTMLElement | null): number {
  const block = getActiveBlockRange(editor)
  if (!block || !canvasEl) return 1

  const dom = editor.view.nodeDOM(block.start)
  if (!dom || !(dom instanceof HTMLElement)) return 1

  const top = getOffsetTopWithin(dom, canvasEl)
  const relative = Math.max(0, top - EDITOR_PAGE.paddingTop)
  return Math.max(1, Math.floor(relative / EDITOR_PAGE.contentHeight) + 1)
}

export function moveBlockToPage(
  editor: Editor,
  targetPage: number,
  canvasEl: HTMLElement | null,
  pageCount: number,
): boolean {
  const block = getActiveBlockRange(editor)
  if (!block || !canvasEl) return false

  const boundedPage = Math.min(pageCount, Math.max(1, targetPage))
  const insertPos = findInsertPosForPage(editor, canvasEl, boundedPage)

  if (insertPos >= block.start && insertPos < block.end) return false
  if (insertPos === block.start) return false

  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      const { node, start, end } = block
      tr.delete(start, end)
      let mappedInsert = tr.mapping.map(insertPos)
      if (insertPos > end) {
        mappedInsert -= end - start
      }
      tr.insert(Math.max(0, mappedInsert), node)
      return true
    })
    .run()
}

export function shouldShowBlockMoveMenu(editor: Editor): boolean {
  return getActiveBlockRange(editor) !== null
}
