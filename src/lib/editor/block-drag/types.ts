import type { BlockRange } from '@/lib/editor/block-move'

export type BlockDragTarget = {
  pos: number
  end: number
  dom: HTMLElement
  range: BlockRange
}

export type DropTarget = {
  insertPos: number
  lineTop: number
  lineLeft: number
  lineWidth: number
}

export type PointerCoords = {
  x: number
  y: number
}

export type BlockBounds = {
  start: number
  end: number
}
