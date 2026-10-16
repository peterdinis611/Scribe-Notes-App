import type { Node } from '@xyflow/react'
import type { CanvasObjectData } from '@/lib/canvas/flow'

export type SnapGuide = {
  orientation: 'x' | 'y'
  /** Flow-space coordinate of the guide line. */
  value: number
}

export type SnapResult = {
  position: { x: number; y: number }
  guides: SnapGuide[]
}

const THRESHOLD = 6

function sizeOf(node: Node<CanvasObjectData>): { w: number; h: number } {
  return {
    w: node.width ?? node.measured?.width ?? 160,
    h: node.height ?? node.measured?.height ?? 120,
  }
}

type EdgeKeys = 'left' | 'centerX' | 'right' | 'top' | 'middleY' | 'bottom'

function edges(node: Node<CanvasObjectData>): Record<EdgeKeys, number> {
  const { w, h } = sizeOf(node)
  const x = node.position.x
  const y = node.position.y
  return {
    left: x,
    centerX: x + w / 2,
    right: x + w,
    top: y,
    middleY: y + h / 2,
    bottom: y + h,
  }
}

/** Snap a dragging node against other nodes' edges/centers. */
export function snapNodePosition(
  dragging: Node<CanvasObjectData>,
  others: Node<CanvasObjectData>[],
  proposed: { x: number; y: number },
  threshold = THRESHOLD,
): SnapResult {
  const { w, h } = sizeOf(dragging)
  let x = proposed.x
  let y = proposed.y
  const guides: SnapGuide[] = []

  const self = {
    left: x,
    centerX: x + w / 2,
    right: x + w,
    top: y,
    middleY: y + h / 2,
    bottom: y + h,
  }

  let bestDx = threshold + 1
  let bestDy = threshold + 1
  let snapX: number | null = null
  let snapY: number | null = null
  let guideX: number | null = null
  let guideY: number | null = null

  for (const other of others) {
    if (other.id === dragging.id) continue
    const o = edges(other)

    const xPairs: Array<[number, number]> = [
      [self.left, o.left],
      [self.left, o.centerX],
      [self.left, o.right],
      [self.centerX, o.left],
      [self.centerX, o.centerX],
      [self.centerX, o.right],
      [self.right, o.left],
      [self.right, o.centerX],
      [self.right, o.right],
    ]
    for (const [from, to] of xPairs) {
      const d = Math.abs(from - to)
      if (d < bestDx) {
        bestDx = d
        snapX = x + (to - from)
        guideX = to
      }
    }

    const yPairs: Array<[number, number]> = [
      [self.top, o.top],
      [self.top, o.middleY],
      [self.top, o.bottom],
      [self.middleY, o.top],
      [self.middleY, o.middleY],
      [self.middleY, o.bottom],
      [self.bottom, o.top],
      [self.bottom, o.middleY],
      [self.bottom, o.bottom],
    ]
    for (const [from, to] of yPairs) {
      const d = Math.abs(from - to)
      if (d < bestDy) {
        bestDy = d
        snapY = y + (to - from)
        guideY = to
      }
    }
  }

  if (snapX != null && bestDx <= threshold) {
    x = snapX
    if (guideX != null) guides.push({ orientation: 'x', value: guideX })
  }
  if (snapY != null && bestDy <= threshold) {
    y = snapY
    if (guideY != null) guides.push({ orientation: 'y', value: guideY })
  }

  return { position: { x, y }, guides }
}
