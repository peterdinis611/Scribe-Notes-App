import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'

export type BlockDragTarget = {
  pos: number
  dom: HTMLElement
}

export function findBlockFromCoords(
  editor: Editor,
  x: number,
  y: number,
): BlockDragTarget | null {
  const view = editor.view
  const coords = view.posAtCoords({ left: x, top: y })
  if (!coords) return null

  const $pos = view.state.doc.resolve(coords.pos)

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const name = $pos.node(depth).type.name
    if (name === 'listItem' || name === 'taskItem') {
      const pos = $pos.before(depth)
      const dom = view.nodeDOM(pos)
      if (dom instanceof HTMLElement) {
        return { pos, dom: dom.closest('li') ?? dom }
      }
    }
  }

  if ($pos.depth >= 1) {
    const node = $pos.node(1)
    if (node.isBlock && node.type.name !== 'doc') {
      const pos = $pos.before(1)
      const dom = view.nodeDOM(pos)
      if (dom instanceof HTMLElement) {
        return { pos, dom }
      }
    }
  }

  return null
}

export function startBlockDrag(
  editor: Editor,
  event: DragEvent,
  blockPos: number,
): boolean {
  const { view } = editor
  const node = view.state.doc.nodeAt(blockPos)
  if (!node || !event.dataTransfer) return false

  const from = blockPos
  const to = from + node.nodeSize
  const slice = view.state.doc.slice(from, to)
  const selection = NodeSelection.create(view.state.doc, from)

  const dom = view.nodeDOM(from)
  if (dom instanceof HTMLElement) {
    const wrapper = document.createElement('div')
    wrapper.style.position = 'absolute'
    wrapper.style.top = '-10000px'
    const clone = dom.cloneNode(true) as HTMLElement
    clone.style.margin = '0'
    wrapper.appendChild(clone)
    document.body.appendChild(wrapper)
    event.dataTransfer.setDragImage(wrapper, 12, 12)
    window.requestAnimationFrame(() => wrapper.remove())
  }

  event.dataTransfer.effectAllowed = 'move'
  view.dragging = { slice, move: true, node: selection } as typeof view.dragging
  view.dispatch(view.state.tr.setSelection(selection))
  return true
}
