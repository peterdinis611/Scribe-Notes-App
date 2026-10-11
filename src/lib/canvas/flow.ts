import type { Edge, Node } from '@xyflow/react'
import {
  createCanvasObject,
  objectToCard,
  type CanvasCard,
  type CanvasDocument,
  type CanvasEdge,
  type CanvasObject,
  type CanvasObjectKind,
} from '@/lib/canvas/types'

/** Keep in sync with `crates/scribe-ui/src/canvas_flow.rs`. */

export const CANVAS_NOTE_TYPE = 'note' as const
export const CANVAS_FRAME_TYPE = 'frame' as const
export const CANVAS_RECT_TYPE = 'rect' as const
export const CANVAS_ELLIPSE_TYPE = 'ellipse' as const
export const CANVAS_TEXT_TYPE = 'text' as const

export type CanvasObjectData = {
  kind: CanvasObjectKind
  text: string
  label: string
  fill: string
  stroke: string
  strokeWidth: number
  fontSize: number
  color: string
  zIndex: number
}

/** @deprecated Prefer CanvasObjectData — kept for note-node typing. */
export type CanvasNoteData = CanvasObjectData

export type CanvasFlowNode = Node<CanvasObjectData, CanvasObjectKind>

export type CanvasNoteNode = Node<CanvasObjectData, typeof CANVAS_NOTE_TYPE>

function objectToNode(object: CanvasObject): CanvasFlowNode {
  return {
    id: object.id,
    type: object.kind,
    position: { x: object.x, y: object.y },
    data: {
      kind: object.kind,
      text: object.text,
      label: object.label,
      fill: object.fill,
      stroke: object.stroke,
      strokeWidth: object.strokeWidth,
      fontSize: object.fontSize,
      color: object.color,
      zIndex: object.zIndex,
    },
    width: object.w,
    height: object.h,
    style: { width: object.w, height: object.h, zIndex: object.zIndex },
    zIndex: object.zIndex,
  }
}

export function objectsToNodes(objects: CanvasObject[]): CanvasFlowNode[] {
  return [...objects]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map(objectToNode)
}

export function cardsToNodes(cards: CanvasCard[]): CanvasFlowNode[] {
  return objectsToNodes(
    cards.map((card, index) => ({
      id: card.id,
      kind: 'note' as const,
      x: card.x,
      y: card.y,
      w: card.w,
      h: card.h,
      zIndex: index,
      text: card.text,
      label: '',
      fill: 'var(--color-surface-elevated)',
      stroke: 'var(--color-border)',
      strokeWidth: 1,
      fontSize: 14,
      color: 'var(--color-foreground)',
    })),
  )
}

export function canvasEdgesToFlow(edges: CanvasEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: 'smoothstep',
  }))
}

function nodeSize(node: Node<CanvasObjectData>, fallback: { w: number; h: number }): { w: number; h: number } {
  const width = node.width ?? node.measured?.width ?? fallback.w
  const height = node.height ?? node.measured?.height ?? fallback.h
  return {
    w: Number.isFinite(width) && width > 24 ? width : fallback.w,
    h: Number.isFinite(height) && height > 24 ? height : fallback.h,
  }
}

function kindOf(node: Node<CanvasObjectData>): CanvasObjectKind {
  if (node.data?.kind) return node.data.kind
  const type = node.type
  if (type === 'frame' || type === 'rect' || type === 'ellipse' || type === 'text' || type === 'note') {
    return type
  }
  return 'note'
}

export function flowToCanvasDocument(
  nodes: Node<CanvasObjectData>[],
  edges: Edge[],
): CanvasDocument {
  const objects: CanvasObject[] = nodes.map((node, index) => {
    const kind = kindOf(node)
    const size = nodeSize(node, { w: 160, h: 120 })
    const data = node.data ?? ({} as CanvasObjectData)
    return {
      id: node.id,
      kind,
      x: node.position.x,
      y: node.position.y,
      w: size.w,
      h: size.h,
      zIndex: Number.isFinite(data.zIndex) ? Number(data.zIndex) : (node.zIndex ?? index),
      text: typeof data.text === 'string' ? data.text : '',
      label: typeof data.label === 'string' ? data.label : '',
      fill: typeof data.fill === 'string' ? data.fill : 'var(--color-surface-elevated)',
      stroke: typeof data.stroke === 'string' ? data.stroke : 'var(--color-border)',
      strokeWidth: Number.isFinite(data.strokeWidth) ? Number(data.strokeWidth) : 1,
      fontSize: Number.isFinite(data.fontSize) ? Number(data.fontSize) : 14,
      color: typeof data.color === 'string' ? data.color : 'var(--color-foreground)',
    }
  })

  const cards = objects
    .map(objectToCard)
    .filter((card): card is CanvasCard => card != null)

  return {
    type: 'canvas',
    version: 2,
    cards,
    objects,
    edges: edges
      .filter((edge) => edge.source && edge.target && edge.source !== edge.target)
      .map((edge) => ({
        id: edge.id,
        from: edge.source,
        to: edge.target,
      })),
  }
}

export function createNoteNode(position: { x: number; y: number }, text = ''): CanvasFlowNode {
  const object = createCanvasObject('note', position, 0)
  if (text) object.text = text
  return objectToNode(object)
}

export function createObjectNode(
  kind: CanvasObjectKind,
  position: { x: number; y: number },
  zIndex = 0,
): CanvasFlowNode {
  return objectToNode(createCanvasObject(kind, position, zIndex))
}

export function nextZIndex(nodes: Node<CanvasObjectData>[]): number {
  let max = -1
  for (const node of nodes) {
    const z = node.data?.zIndex ?? node.zIndex ?? 0
    if (z > max) max = z
  }
  return max + 1
}
