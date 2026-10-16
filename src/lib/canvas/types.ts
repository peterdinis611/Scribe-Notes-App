/** Keep in sync with `crates/scribe-ui` counterpart. */

export type CanvasObjectKind =
  | 'note'
  | 'frame'
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'line'
  | 'arrow'
  | 'docLink'
  | 'pen'

export type CanvasPoint = { x: number; y: number }

export type CanvasCard = {
  id: string
  x: number
  y: number
  w: number
  h: number
  text: string
}

export type CanvasObject = {
  id: string
  kind: CanvasObjectKind
  x: number
  y: number
  w: number
  h: number
  zIndex: number
  text: string
  label: string
  fill: string
  stroke: string
  strokeWidth: number
  fontSize: number
  color: string
  opacity: number
  cornerRadius: number
  rotation: number
  groupId: string
  /** Parent frame id when nested; empty = free on canvas. */
  parentId: string
  documentId: string
  documentTitle: string
  /** Freehand path points relative to object origin (pen kind). */
  points: CanvasPoint[]
}

export type CanvasEdge = {
  id: string
  from: string
  to: string
}

export type CanvasViewport = {
  x: number
  y: number
  zoom: number
}

export type CanvasDocument = {
  type: 'canvas'
  version: 1 | 2
  /** v1 sticky notes — still written for back-compat. */
  cards: CanvasCard[]
  /** v2 scene objects (notes, frames, shapes, text). */
  objects: CanvasObject[]
  edges: CanvasEdge[]
  viewport?: CanvasViewport
}

export const CANVAS_CONTENT_TYPE = 'canvas' as const
export const CANVAS_VERSION = 2 as const

export const DEFAULT_CARD_W = 200
export const DEFAULT_CARD_H = 120
export const DEFAULT_FRAME_W = 360
export const DEFAULT_FRAME_H = 240
export const DEFAULT_SHAPE_W = 160
export const DEFAULT_SHAPE_H = 120
export const DEFAULT_TEXT_W = 180
export const DEFAULT_TEXT_H = 48
export const DEFAULT_LINE_W = 160
export const DEFAULT_LINE_H = 24
export const DEFAULT_DOCLINK_W = 220
export const DEFAULT_DOCLINK_H = 64

/** Theme-aligned fills — not a generic rainbow picker. */
export const CANVAS_FILL_PRESETS = [
  'var(--color-surface-elevated)',
  'var(--color-canvas)',
  'color-mix(in srgb, var(--color-accent) 18%, var(--color-surface))',
  'color-mix(in srgb, var(--color-muted) 35%, var(--color-surface))',
  'transparent',
] as const

export const CANVAS_STROKE_PRESETS = [
  'var(--color-border)',
  'var(--color-accent)',
  'var(--color-muted)',
  'var(--color-foreground)',
] as const

const KIND_SET = new Set<string>([
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

export function emptyCanvasDocument(): CanvasDocument {
  return {
    type: CANVAS_CONTENT_TYPE,
    version: CANVAS_VERSION,
    cards: [],
    objects: [],
    edges: [],
  }
}

export function isCanvasContent(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (record.type !== CANVAS_CONTENT_TYPE) return false
  const version = record.version
  const versionOk =
    version === undefined || version === 1 || version === 2 || version === 1.0 || version === 2.0
  if (!versionOk) return false
  const hasCards = Array.isArray(record.cards)
  const hasObjects = Array.isArray(record.objects)
  return (hasCards || hasObjects) && Array.isArray(record.edges)
}

export function cardToObject(card: CanvasCard, zIndex = 0): CanvasObject {
  return {
    id: card.id,
    kind: 'note',
    x: card.x,
    y: card.y,
    w: card.w,
    h: card.h,
    zIndex,
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
  }
}

export function objectToCard(object: CanvasObject): CanvasCard | null {
  if (object.kind !== 'note') return null
  return {
    id: object.id,
    x: object.x,
    y: object.y,
    w: object.w,
    h: object.h,
    text: object.text,
  }
}

export function parseCanvasDocument(contentJson: string): CanvasDocument | null {
  try {
    const parsed: unknown = JSON.parse(contentJson)
    if (!isCanvasContent(parsed)) return null
    const record = parsed as Record<string, unknown>
    const edges = (record.edges as unknown[])
      .map(normalizeEdge)
      .filter((edge): edge is CanvasEdge => edge != null)

    let objects: CanvasObject[] = []
    if (Array.isArray(record.objects) && record.objects.length > 0) {
      objects = record.objects.map((raw, index) => normalizeObject(raw, index))
    } else if (Array.isArray(record.cards)) {
      objects = (record.cards as unknown[]).map((raw, index) =>
        cardToObject(normalizeCard(raw), index),
      )
    }

    const cards = objects
      .map(objectToCard)
      .filter((card): card is CanvasCard => card != null)

    const viewport = normalizeViewport(record.viewport)

    return {
      type: CANVAS_CONTENT_TYPE,
      version: CANVAS_VERSION,
      cards,
      objects,
      edges,
      ...(viewport ? { viewport } : {}),
    }
  } catch {
    return null
  }
}

function normalizeViewport(raw: unknown): CanvasViewport | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const v = raw as Partial<CanvasViewport>
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.zoom)) return undefined
  return {
    x: Number(v.x),
    y: Number(v.y),
    zoom: Math.min(2.5, Math.max(0.35, Number(v.zoom))),
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

function normalizeKind(raw: unknown): CanvasObjectKind {
  if (typeof raw === 'string' && KIND_SET.has(raw)) return raw as CanvasObjectKind
  return 'note'
}

function normalizeObject(raw: unknown, index: number): CanvasObject {
  const obj = (raw ?? {}) as Partial<CanvasObject> & { kind?: string }
  const kind = normalizeKind(obj.kind)
  const defaults = defaultsForKind(kind)
  const minSize = kind === 'line' || kind === 'arrow' ? 8 : 24
  return {
    id: typeof obj.id === 'string' && obj.id ? obj.id : crypto.randomUUID(),
    kind,
    x: Number.isFinite(obj.x) ? Number(obj.x) : 0,
    y: Number.isFinite(obj.y) ? Number(obj.y) : 0,
    w: Number.isFinite(obj.w) && Number(obj.w) > minSize ? Number(obj.w) : defaults.w,
    h: Number.isFinite(obj.h) && Number(obj.h) > minSize ? Number(obj.h) : defaults.h,
    zIndex: Number.isFinite(obj.zIndex) ? Number(obj.zIndex) : index,
    text: typeof obj.text === 'string' ? obj.text : '',
    label: typeof obj.label === 'string' ? obj.label : kind === 'frame' ? 'Frame' : '',
    fill: typeof obj.fill === 'string' && obj.fill ? obj.fill : defaults.fill,
    stroke: typeof obj.stroke === 'string' && obj.stroke ? obj.stroke : defaults.stroke,
    strokeWidth:
      Number.isFinite(obj.strokeWidth) && Number(obj.strokeWidth) >= 0
        ? Number(obj.strokeWidth)
        : defaults.strokeWidth,
    fontSize:
      Number.isFinite(obj.fontSize) && Number(obj.fontSize) >= 10
        ? Number(obj.fontSize)
        : defaults.fontSize,
    color: typeof obj.color === 'string' && obj.color ? obj.color : defaults.color,
    opacity:
      Number.isFinite(obj.opacity) ? Math.min(1, Math.max(0, Number(obj.opacity))) : 1,
    cornerRadius:
      Number.isFinite(obj.cornerRadius) && Number(obj.cornerRadius) >= 0
        ? Number(obj.cornerRadius)
        : defaults.cornerRadius,
    rotation: Number.isFinite(obj.rotation) ? Number(obj.rotation) : 0,
    groupId: typeof obj.groupId === 'string' ? obj.groupId : '',
    parentId: typeof obj.parentId === 'string' ? obj.parentId : '',
    documentId: typeof obj.documentId === 'string' ? obj.documentId : '',
    documentTitle: typeof obj.documentTitle === 'string' ? obj.documentTitle : '',
    points: normalizePoints(obj.points),
  }
}

function normalizePoints(raw: unknown): CanvasPoint[] {
  if (!Array.isArray(raw)) return []
  const points: CanvasPoint[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const p = item as Partial<CanvasPoint>
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
    points.push({ x: Number(p.x), y: Number(p.y) })
  }
  return points
}

function defaultsForKind(kind: CanvasObjectKind): Pick<
  CanvasObject,
  'w' | 'h' | 'fill' | 'stroke' | 'strokeWidth' | 'fontSize' | 'color' | 'cornerRadius'
> {
  switch (kind) {
    case 'frame':
      return {
        w: DEFAULT_FRAME_W,
        h: DEFAULT_FRAME_H,
        fill: 'color-mix(in srgb, var(--color-surface) 88%, transparent)',
        stroke: 'var(--color-border)',
        strokeWidth: 1.5,
        fontSize: 12,
        color: 'var(--color-muted-foreground)',
        cornerRadius: 4,
      }
    case 'rect':
    case 'ellipse':
      return {
        w: DEFAULT_SHAPE_W,
        h: DEFAULT_SHAPE_H,
        fill: 'color-mix(in srgb, var(--color-accent) 18%, var(--color-surface))',
        stroke: 'var(--color-accent)',
        strokeWidth: 1.5,
        fontSize: 14,
        color: 'var(--color-foreground)',
        cornerRadius: kind === 'ellipse' ? 999 : 10,
      }
    case 'text':
      return {
        w: DEFAULT_TEXT_W,
        h: DEFAULT_TEXT_H,
        fill: 'transparent',
        stroke: 'transparent',
        strokeWidth: 0,
        fontSize: 18,
        color: 'var(--color-foreground)',
        cornerRadius: 0,
      }
    case 'line':
    case 'arrow':
      return {
        w: DEFAULT_LINE_W,
        h: DEFAULT_LINE_H,
        fill: 'transparent',
        stroke: 'var(--color-accent)',
        strokeWidth: 2,
        fontSize: 12,
        color: 'var(--color-foreground)',
        cornerRadius: 0,
      }
    case 'docLink':
      return {
        w: DEFAULT_DOCLINK_W,
        h: DEFAULT_DOCLINK_H,
        fill: 'var(--color-surface-elevated)',
        stroke: 'var(--color-border)',
        strokeWidth: 1,
        fontSize: 13,
        color: 'var(--color-foreground)',
        cornerRadius: 10,
      }
    case 'pen':
      return {
        w: 120,
        h: 80,
        fill: 'transparent',
        stroke: 'var(--color-accent)',
        strokeWidth: 2.5,
        fontSize: 12,
        color: 'var(--color-foreground)',
        cornerRadius: 0,
      }
    case 'note':
    default:
      return {
        w: DEFAULT_CARD_W,
        h: DEFAULT_CARD_H,
        fill: 'var(--color-surface-elevated)',
        stroke: 'var(--color-border)',
        strokeWidth: 1,
        fontSize: 14,
        color: 'var(--color-foreground)',
        cornerRadius: 10,
      }
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
  const objects = doc.objects.length > 0 ? doc.objects : doc.cards.map((card, i) => cardToObject(card, i))
  const cards = objects.map(objectToCard).filter((card): card is CanvasCard => card != null)
  return JSON.stringify({
    type: CANVAS_CONTENT_TYPE,
    version: CANVAS_VERSION,
    cards,
    objects,
    edges: doc.edges,
    ...(doc.viewport ? { viewport: doc.viewport } : {}),
  })
}

export function createCanvasObject(
  kind: CanvasObjectKind,
  position: { x: number; y: number },
  zIndex = 0,
  extras?: Partial<Pick<CanvasObject, 'documentId' | 'documentTitle' | 'w' | 'h' | 'x' | 'y'>>,
): CanvasObject {
  const defaults = defaultsForKind(kind)
  const w = extras?.w ?? defaults.w
  const h = extras?.h ?? defaults.h
  return {
    id: crypto.randomUUID(),
    kind,
    x: extras?.x ?? position.x - w / 2,
    y: extras?.y ?? position.y - h / 2,
    w,
    h,
    zIndex,
    text: kind === 'text' ? 'Text' : '',
    label: kind === 'frame' ? 'Frame' : '',
    fill: defaults.fill,
    stroke: defaults.stroke,
    strokeWidth: defaults.strokeWidth,
    fontSize: defaults.fontSize,
    color: defaults.color,
    opacity: 1,
    cornerRadius: defaults.cornerRadius,
    rotation: 0,
    groupId: '',
    parentId: '',
    documentId: extras?.documentId ?? '',
    documentTitle: extras?.documentTitle ?? '',
    points: [],
  }
}

export function canvasObjectsToPlainText(objects: CanvasObject[]): string {
  return objects
    .filter((obj) => obj.kind === 'note' || obj.kind === 'text' || obj.kind === 'docLink')
    .map((obj) => {
      if (obj.kind === 'docLink') {
        return obj.documentTitle || obj.label || obj.documentId || 'Document'
      }
      return obj.text.trim()
    })
    .filter(Boolean)
    .join('\n\n')
}
