export type CanvasCard = {
  id: string
  x: number
  y: number
  w: number
  h: number
  text: string
}

export type CanvasEdge = {
  id: string
  from: string
  to: string
}

export type CanvasDocument = {
  type: 'canvas'
  version: 1
  cards: CanvasCard[]
  edges: CanvasEdge[]
}

export const CANVAS_CONTENT_TYPE = 'canvas' as const
export const CANVAS_VERSION = 1 as const

export const DEFAULT_CARD_W = 200
export const DEFAULT_CARD_H = 120

export function emptyCanvasDocument(): CanvasDocument {
  return {
    type: CANVAS_CONTENT_TYPE,
    version: CANVAS_VERSION,
    cards: [],
    edges: [],
  }
}

export function isCanvasContent(value: unknown): value is CanvasDocument {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.type === CANVAS_CONTENT_TYPE &&
    (record.version === 1 || record.version === undefined) &&
    Array.isArray(record.cards) &&
    Array.isArray(record.edges)
  )
}

export function parseCanvasDocument(contentJson: string): CanvasDocument | null {
  try {
    const parsed: unknown = JSON.parse(contentJson)
    if (!isCanvasContent(parsed)) return null
    return {
      type: CANVAS_CONTENT_TYPE,
      version: CANVAS_VERSION,
      cards: parsed.cards.map(normalizeCard),
      edges: parsed.edges.map(normalizeEdge).filter((edge): edge is CanvasEdge => edge != null),
    }
  } catch {
    return null
  }
}

function normalizeCard(raw: unknown): CanvasCard {
  const card = (raw ?? {}) as Partial<CanvasCard>
  return {
    id: typeof card.id === 'string' && card.id ? card.id : crypto.randomUUID(),
    x: Number.isFinite(card.x) ? Number(card.x) : 0,
    y: Number.isFinite(card.y) ? Number(card.y) : 0,
    w: Number.isFinite(card.w) && Number(card.w) > 40 ? Number(card.w) : DEFAULT_CARD_W,
    h: Number.isFinite(card.h) && Number(card.h) > 40 ? Number(card.h) : DEFAULT_CARD_H,
    text: typeof card.text === 'string' ? card.text : '',
  }
}

function normalizeEdge(raw: unknown): CanvasEdge | null {
  const edge = (raw ?? {}) as Partial<CanvasEdge>
  if (typeof edge.from !== 'string' || typeof edge.to !== 'string') return null
  if (!edge.from || !edge.to || edge.from === edge.to) return null
  return {
    id: typeof edge.id === 'string' && edge.id ? edge.id : crypto.randomUUID(),
    from: edge.from,
    to: edge.to,
  }
}

export function serializeCanvasDocument(doc: CanvasDocument): string {
  return JSON.stringify({
    type: CANVAS_CONTENT_TYPE,
    version: CANVAS_VERSION,
    cards: doc.cards,
    edges: doc.edges,
  })
}
