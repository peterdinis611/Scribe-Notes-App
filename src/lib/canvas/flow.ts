import type { Edge, Node } from '@xyflow/react'
import {
  createCanvasObject,
  objectToCard,
  type CanvasCard,
  type CanvasDocument,
  type CanvasEdge,
  type CanvasObject,
  type CanvasObjectKind,
  type CanvasPoint,
  type CanvasViewport,
} from '@/lib/canvas/types'

/** Keep in sync with `crates/scribe-ui/src/canvas_flow.rs`. */

export const CANVAS_NOTE_TYPE = 'note' as const
export const CANVAS_FRAME_TYPE = 'frame' as const
export const CANVAS_RECT_TYPE = 'rect' as const
export const CANVAS_ELLIPSE_TYPE = 'ellipse' as const
export const CANVAS_TEXT_TYPE = 'text' as const
export const CANVAS_LINE_TYPE = 'line' as const
export const CANVAS_ARROW_TYPE = 'arrow' as const
export const CANVAS_DOCLINK_TYPE = 'docLink' as const
export const CANVAS_PEN_TYPE = 'pen' as const

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
  opacity: number
  cornerRadius: number
  rotation: number
  groupId: string
  parentId: string
  documentId: string
  documentTitle: string
  points: CanvasPoint[]
}

/** @deprecated Prefer CanvasObjectData — kept for note-node typing. */
export type CanvasNoteData = CanvasObjectData

export type CanvasFlowNode = Node<CanvasObjectData, CanvasObjectKind>

export type CanvasNoteNode = Node<CanvasObjectData, typeof CANVAS_NOTE_TYPE>

const KNOWN_KINDS = new Set<CanvasObjectKind>([
  'note',
  'frame',
  'rect',
  'ellipse',
  'text',
  'line',
  'arrow',
  'docLink',
  'pen',
])

function objectToNode(object: CanvasObject): CanvasFlowNode {
  const node: CanvasFlowNode = {
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
      opacity: object.opacity,
      cornerRadius: object.cornerRadius,
      rotation: object.rotation,
      groupId: object.groupId,
      parentId: object.parentId,
      documentId: object.documentId,
      documentTitle: object.documentTitle,
      points: object.points ?? [],
    },
    width: object.w,
    height: object.h,
    style: {
      width: object.w,
      height: object.h,
      zIndex: object.zIndex,
      opacity: object.opacity,
      transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined,
    },
    zIndex: object.zIndex,
  }
  if (object.parentId) {
    node.parentId = object.parentId
    node.extent = 'parent'
  }
  return node
}

export function objectsToNodes(objects: CanvasObject[]): CanvasFlowNode[] {
  // Parents before children so React Flow can resolve nesting.
  const frames = objects.filter((o) => o.kind === 'frame')
  const rest = objects.filter((o) => o.kind !== 'frame')
  const ordered = [...frames, ...rest].sort((a, b) => a.zIndex - b.zIndex)
  return ordered.map(objectToNode)
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
      opacity: 1,
      cornerRadius: 10,
      rotation: 0,
      groupId: '',
      parentId: '',
      documentId: '',
      documentTitle: '',
      points: [],
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
    w: Number.isFinite(width) && width > 8 ? width : fallback.w,
    h: Number.isFinite(height) && height > 8 ? height : fallback.h,
  }
}

function kindOf(node: Node<CanvasObjectData>): CanvasObjectKind {
  if (node.data?.kind && KNOWN_KINDS.has(node.data.kind)) return node.data.kind
  const type = node.type as CanvasObjectKind | undefined
  if (type && KNOWN_KINDS.has(type)) return type
  return 'note'
}

export function flowToCanvasDocument(
  nodes: Node<CanvasObjectData>[],
  edges: Edge[],
  viewport?: CanvasViewport,
): CanvasDocument {
  const objects: CanvasObject[] = nodes.map((node, index) => {
    const kind = kindOf(node)
    const size = nodeSize(node, { w: 160, h: 120 })
    const data = node.data ?? ({} as CanvasObjectData)
    const parentId =
      (typeof node.parentId === 'string' && node.parentId) ||
      (typeof data.parentId === 'string' ? data.parentId : '')
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
      opacity: Number.isFinite(data.opacity) ? Number(data.opacity) : 1,
      cornerRadius: Number.isFinite(data.cornerRadius) ? Number(data.cornerRadius) : 0,
      rotation: Number.isFinite(data.rotation) ? Number(data.rotation) : 0,
      groupId: typeof data.groupId === 'string' ? data.groupId : '',
      parentId,
      documentId: typeof data.documentId === 'string' ? data.documentId : '',
      documentTitle: typeof data.documentTitle === 'string' ? data.documentTitle : '',
      points: Array.isArray(data.points) ? data.points : [],
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
    ...(viewport ? { viewport } : {}),
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
  extras?: Parameters<typeof createCanvasObject>[3],
): CanvasFlowNode {
  return objectToNode(createCanvasObject(kind, position, zIndex, extras))
}

export function nextZIndex(nodes: Node<CanvasObjectData>[]): number {
  let max = -1
  for (const node of nodes) {
    const z = node.data?.zIndex ?? node.zIndex ?? 0
    if (z > max) max = z
  }
  return max + 1
}

/** Absolute top-left of a node accounting for parent chain. */
export function absolutePosition(
  node: Node<CanvasObjectData>,
  byId: Map<string, Node<CanvasObjectData>>,
): { x: number; y: number } {
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId
  while (parentId) {
    const parent = byId.get(parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  return { x, y }
}

export { objectToNode }
