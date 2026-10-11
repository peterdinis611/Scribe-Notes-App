import type { Node } from '@xyflow/react'
import type { CanvasObjectData } from '@/lib/canvas/flow'

export type AlignMode =
  | 'left'
  | 'centerX'
  | 'right'
  | 'top'
  | 'middleY'
  | 'bottom'
  | 'distributeX'
  | 'distributeY'

function sizeOf(node: Node<CanvasObjectData>): { w: number; h: number } {
  return {
    w: node.width ?? node.measured?.width ?? 160,
    h: node.height ?? node.measured?.height ?? 120,
  }
}

/** Align or distribute selected nodes; returns a new nodes array. */
export function alignNodes(
  nodes: Node<CanvasObjectData>[],
  selectedIds: Set<string>,
  mode: AlignMode,
): Node<CanvasObjectData>[] {
  const selected = nodes.filter((n) => selectedIds.has(n.id))
  if (selected.length < 2) return nodes

  const boxes = selected.map((node) => {
    const { w, h } = sizeOf(node)
    return {
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      w,
      h,
      cx: node.position.x + w / 2,
      cy: node.position.y + h / 2,
      right: node.position.x + w,
      bottom: node.position.y + h,
    }
  })

  const minX = Math.min(...boxes.map((b) => b.x))
  const maxRight = Math.max(...boxes.map((b) => b.right))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxBottom = Math.max(...boxes.map((b) => b.bottom))
  const midX = (minX + maxRight) / 2
  const midY = (minY + maxBottom) / 2

  const nextPos = new Map<string, { x: number; y: number }>()

  if (mode === 'distributeX' || mode === 'distributeY') {
    const sorted = [...boxes].sort((a, b) =>
      mode === 'distributeX' ? a.x - b.x : a.y - b.y,
    )
    if (sorted.length < 3) return nodes
    if (mode === 'distributeX') {
      const totalW = sorted.reduce((sum, b) => sum + b.w, 0)
      const span = maxRight - minX
      const gap = (span - totalW) / (sorted.length - 1)
      let cursor = minX
      for (const box of sorted) {
        nextPos.set(box.id, { x: cursor, y: box.y })
        cursor += box.w + gap
      }
    } else {
      const totalH = sorted.reduce((sum, b) => sum + b.h, 0)
      const span = maxBottom - minY
      const gap = (span - totalH) / (sorted.length - 1)
      let cursor = minY
      for (const box of sorted) {
        nextPos.set(box.id, { x: box.x, y: cursor })
        cursor += box.h + gap
      }
    }
  } else {
    for (const box of boxes) {
      let x = box.x
      let y = box.y
      switch (mode) {
        case 'left':
          x = minX
          break
        case 'centerX':
          x = midX - box.w / 2
          break
        case 'right':
          x = maxRight - box.w
          break
        case 'top':
          y = minY
          break
        case 'middleY':
          y = midY - box.h / 2
          break
        case 'bottom':
          y = maxBottom - box.h
          break
      }
      nextPos.set(box.id, { x, y })
    }
  }

  return nodes.map((node) => {
    const pos = nextPos.get(node.id)
    if (!pos) return node
    return { ...node, position: pos }
  })
}
