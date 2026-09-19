import type { Edge, Node } from '@xyflow/react'
import {
  DEFAULT_CARD_H,
  DEFAULT_CARD_W,
  type CanvasCard,
  type CanvasDocument,
  type CanvasEdge,
} from '@/lib/canvas/types'

export const CANVAS_NOTE_TYPE = 'note' as const

export type CanvasNoteData = {
  text: string
}

export type CanvasNoteNode = Node<CanvasNoteData, typeof CANVAS_NOTE_TYPE>

export function cardsToNodes(cards: CanvasCard[]): CanvasNoteNode[] {
  return cards.map((card) => ({
    id: card.id,
    type: CANVAS_NOTE_TYPE,
    position: { x: card.x, y: card.y },
    data: { text: card.text },
    width: card.w,
    height: card.h,
    style: { width: card.w, height: card.h },
  }))
}

export function canvasEdgesToFlow(edges: CanvasEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: 'smoothstep',
  }))
}

function nodeSize(node: Node<CanvasNoteData>): { w: number; h: number } {
  const width = node.width ?? node.measured?.width ?? DEFAULT_CARD_W
  const height = node.height ?? node.measured?.height ?? DEFAULT_CARD_H
  return {
    w: Number.isFinite(width) && width > 40 ? width : DEFAULT_CARD_W,
    h: Number.isFinite(height) && height > 40 ? height : DEFAULT_CARD_H,
  }
}

export function flowToCanvasDocument(
  nodes: Node<CanvasNoteData>[],
  edges: Edge[],
): CanvasDocument {
  return {
    type: 'canvas',
    version: 1,
    cards: nodes.map((node) => {
      const size = nodeSize(node)
      return {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        w: size.w,
        h: size.h,
        text: typeof node.data.text === 'string' ? node.data.text : '',
      }
    }),
    edges: edges
      .filter((edge) => edge.source && edge.target && edge.source !== edge.target)
      .map((edge) => ({
        id: edge.id,
        from: edge.source,
        to: edge.target,
      })),
  }
}

export function createNoteNode(position: { x: number; y: number }, text = ''): CanvasNoteNode {
  const id = crypto.randomUUID()
  return {
    id,
    type: CANVAS_NOTE_TYPE,
    position: {
      x: position.x - DEFAULT_CARD_W / 2,
      y: position.y - DEFAULT_CARD_H / 2,
    },
    data: { text },
    width: DEFAULT_CARD_W,
    height: DEFAULT_CARD_H,
    style: { width: DEFAULT_CARD_W, height: DEFAULT_CARD_H },
  }
}
