import type { Editor } from '@tiptap/react'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import { MoveFailed, NoOpMove } from '@/lib/editor/block-drag/errors'
import type { BlockBounds, BlockDragTarget, DropTarget } from '@/lib/editor/block-drag/types'
import { isEditorViewReady } from '@/lib/editor/view-ready'
import { getActiveBlockRange, getBlockRangeAtPos, type BlockRange } from '@/lib/editor/block-move'

type BlockRect = {
  range: BlockRange
  dom: HTMLElement
  rect: DOMRect
}

const LIST_CONTAINER = new Set(['bulletList', 'orderedList', 'taskList'])

function getTopLevelBlockElement(tiptap: HTMLElement, dom: Node): HTMLElement | null {
  let el = dom instanceof HTMLElement ? dom : dom.parentElement
  if (!el) return null

  if (el.closest('li')) {
    return el.closest('li')
  }

  while (el.parentElement && el.parentElement !== tiptap) {
    el = el.parentElement
  }

  return el
}

function blockDomForRange(editor: Editor, range: BlockRange): HTMLElement | null {
  if (!isEditorViewReady(editor)) return null

  const view = editor.view
  const tiptap = view.dom
  const dom = view.nodeDOM(range.start)
  if (!dom) return null
  return getTopLevelBlockElement(tiptap, dom)
}

function blockTargetFromRange(editor: Editor, range: BlockRange): BlockDragTarget | null {
  const dom = blockDomForRange(editor, range)
  if (!dom) return null

  return {
    pos: range.start,
    end: range.end,
    dom,
    range,
  }
}

function collectMovableBlockRects(editor: Editor): BlockRect[] {
  const { doc } = editor.state
  const blocks: BlockRect[] = []

  function addRange(range: BlockRange) {
    const dom = blockDomForRange(editor, range)
    if (!dom) return

    const rect = dom.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return

    if (blocks.some((entry) => entry.range.start === range.start)) return
    blocks.push({ range, dom, rect })
  }

  function walkListItems(listNode: PMNode, listStart: number) {
    let itemPos = listStart + 1
    for (let i = 0; i < listNode.childCount; i += 1) {
      const item = listNode.child(i)
      const insidePos = Math.min(itemPos + 1, doc.content.size)
      const range = getBlockRangeAtPos(doc.resolve(insidePos))
      if (range) addRange(range)
      itemPos += item.nodeSize
    }
  }

  let pos = 0
  for (let i = 0; i < doc.childCount; i += 1) {
    const node = doc.child(i)

    if (LIST_CONTAINER.has(node.type.name)) {
      walkListItems(node, pos)
    } else {
      const insidePos = Math.min(pos + 1, doc.content.size)
      const range = getBlockRangeAtPos(doc.resolve(insidePos))
      if (range) addRange(range)
    }

    pos += node.nodeSize
  }

  return blocks
}

function isValidDrop(insertPos: number, exclude?: BlockBounds) {
  if (!exclude) return true
  if (insertPos > exclude.start && insertPos < exclude.end) return false
  if (insertPos === exclude.start || insertPos === exclude.end) return false
  return true
}

export const findBlockFromSelection = (editor: Editor): Effect.Effect<Option.Option<BlockDragTarget>> =>
  Effect.sync(() => {
    if (editor.isDestroyed || !isEditorViewReady(editor)) return Option.none()

    const range = getActiveBlockRange(editor)
    if (!range) return Option.none()

    return Option.fromNullable(blockTargetFromRange(editor, range))
  })

export const findBlockFromCoords = (
  editor: Editor,
  x: number,
  y: number,
): Effect.Effect<Option.Option<BlockDragTarget>> =>
  Effect.sync(() => {
    if (editor.isDestroyed || !isEditorViewReady(editor)) return Option.none()

    const coords = editor.view.posAtCoords({ left: x, top: y })
    if (!coords) return Option.none()

    const range = getBlockRangeAtPos(editor.state.doc.resolve(coords.pos))
    if (!range) return Option.none()

    return Option.fromNullable(blockTargetFromRange(editor, range))
  })

export const resolveDragBlock = (
  editor: Editor,
  fallback: BlockDragTarget,
  coords: { x: number; y: number },
): Effect.Effect<BlockDragTarget> =>
  Effect.gen(function* () {
    const fromSelection = yield* findBlockFromSelection(editor)
    if (Option.isSome(fromSelection)) return fromSelection.value

    const fromCoords = yield* findBlockFromCoords(editor, coords.x, coords.y)
    if (Option.isSome(fromCoords)) return fromCoords.value

    return fallback
  })

export const getDropTargetFromCoords = (
  editor: Editor,
  _x: number,
  y: number,
  exclude?: BlockBounds,
): Effect.Effect<Option.Option<DropTarget>> =>
  Effect.sync(() => {
    if (editor.isDestroyed || !isEditorViewReady(editor)) return Option.none()

    const view = editor.view
    const blocks = collectMovableBlockRects(editor)
    if (!blocks.length) return Option.none()

    let insertPos = blocks[0].range.start
    let lineTop = blocks[0].rect.top

    for (const block of blocks) {
      const mid = block.rect.top + block.rect.height / 2
      if (y < mid) {
        insertPos = block.range.start
        lineTop = block.rect.top
        break
      }

      insertPos = block.range.end
      lineTop = block.rect.bottom
    }

    if (!isValidDrop(insertPos, exclude)) return Option.none()

    const editorRect = view.dom.getBoundingClientRect()

    return Option.some({
      insertPos,
      lineTop,
      lineLeft: editorRect.left + 12,
      lineWidth: Math.max(120, editorRect.width - 24),
    })
  })

export const moveBlock = (
  editor: Editor,
  fromStart: number,
  insertPos: number,
): Effect.Effect<void, MoveFailed | NoOpMove> =>
  Effect.gen(function* () {
    if (editor.isDestroyed) {
      return yield* Effect.fail(new MoveFailed({ fromStart, insertPos }))
    }

    const node = editor.state.doc.nodeAt(fromStart)
    if (!node) {
      return yield* Effect.fail(new MoveFailed({ fromStart, insertPos }))
    }

    const fromEnd = fromStart + node.nodeSize
    if (insertPos >= fromStart && insertPos <= fromEnd) {
      return yield* Effect.fail(new NoOpMove({ fromStart, insertPos }))
    }

    const moved = editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        if (!dispatch) return true

        tr.delete(fromStart, fromEnd)
        const mappedInsert = tr.mapping.map(insertPos)
        tr.insert(mappedInsert, node)

        const $pos = tr.doc.resolve(Math.min(mappedInsert, tr.doc.content.size))
        tr.setSelection(TextSelection.near($pos))
        return true
      })
      .run()

    if (!moved) {
      return yield* Effect.fail(new MoveFailed({ fromStart, insertPos }))
    }
  })

export const tryMoveBlock = (
  editor: Editor,
  fromStart: number,
  insertPos: number,
): Effect.Effect<void, MoveFailed> =>
  moveBlock(editor, fromStart, insertPos).pipe(
    Effect.catchTag('NoOpMove', () => Effect.void),
  )
