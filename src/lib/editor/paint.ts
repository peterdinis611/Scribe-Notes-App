/** Freehand paint pad — TipTap atom attrs + stroke helpers. */

export type PaintTool = 'pen' | 'highlighter' | 'eraser'

export type PaintPoint = { x: number; y: number }

export type PaintStroke = {
  tool: PaintTool
  color: string
  width: number
  points: PaintPoint[]
}

export const PAINT_DEFAULT_WIDTH = 640
export const PAINT_DEFAULT_HEIGHT = 360
export const PAINT_DEFAULT_BG = '#f4efe6'
export const PAINT_DEFAULT_COLOR = '#1a1814'
export const PAINT_INK_COLORS = [
  '#1a1814',
  '#b91c1c',
  '#1d4ed8',
  '#15803d',
  '#b45309',
  '#fafaf9',
] as const

/** Marker / highlighter washes (drawn with multiply). */
export const PAINT_HIGHLIGHTER_COLORS = [
  '#facc15',
  '#fb7185',
  '#38bdf8',
  '#4ade80',
  '#c084fc',
  '#fdba74',
] as const

export const PAINT_PAPER_COLORS = [
  '#f4efe6',
  '#fafaf9',
  '#e8eef5',
  '#1a1814',
  '#12201a',
] as const

export const PAINT_EMPTY_STROKES = '[]'

export function parsePaintStrokes(raw: unknown): PaintStroke[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => normalizeStroke(item))
      .filter((stroke): stroke is PaintStroke => stroke != null)
  } catch {
    return []
  }
}

function normalizeTool(value: unknown): PaintTool {
  if (value === 'eraser') return 'eraser'
  if (value === 'highlighter' || value === 'marker') return 'highlighter'
  return 'pen'
}

function normalizeStroke(value: unknown): PaintStroke | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const tool = normalizeTool(row.tool)
  const color = typeof row.color === 'string' && row.color ? row.color : PAINT_DEFAULT_COLOR
  const width =
    typeof row.width === 'number' && Number.isFinite(row.width)
      ? Math.max(1, Math.min(64, row.width))
      : tool === 'highlighter'
        ? 16
        : 3
  const pointsRaw = Array.isArray(row.points) ? row.points : []
  const points: PaintPoint[] = []
  for (const point of pointsRaw) {
    if (!point || typeof point !== 'object') continue
    const p = point as Record<string, unknown>
    const x = typeof p.x === 'number' ? p.x : Number(p.x)
    const y = typeof p.y === 'number' ? p.y : Number(p.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    points.push({ x, y })
  }
  if (points.length < 1) return null
  return { tool, color, width, points }
}

export function serializePaintStrokes(strokes: PaintStroke[]): string {
  return JSON.stringify(strokes)
}

export function paintStrokeCount(raw: unknown): number {
  return parsePaintStrokes(raw).length
}

function strokeStyleFor(tool: PaintTool, color: string): string {
  if (tool !== 'highlighter') return color
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    const hex = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color
    const r = Number.parseInt(hex.slice(1, 3), 16)
    const g = Number.parseInt(hex.slice(3, 5), 16)
    const b = Number.parseInt(hex.slice(5, 7), 16)
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      return `rgba(${r},${g},${b},0.45)`
    }
  }
  return color
}

/** Draw strokes onto a 2d context (logical canvas coords). */
export function renderPaintStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: PaintStroke[],
  opts?: { background?: string; width?: number; height?: number },
) {
  const width = opts?.width ?? PAINT_DEFAULT_WIDTH
  const height = opts?.height ?? PAINT_DEFAULT_HEIGHT
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = opts?.background ?? PAINT_DEFAULT_BG
  ctx.fillRect(0, 0, width, height)

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = stroke.width
    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else if (stroke.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply'
      ctx.strokeStyle = strokeStyleFor('highlighter', stroke.color)
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = stroke.color
    }
    ctx.beginPath()
    const [first, ...rest] = stroke.points
    ctx.moveTo(first.x, first.y)
    if (rest.length === 0) {
      ctx.lineTo(first.x + 0.01, first.y + 0.01)
    } else {
      for (const point of rest) ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }
  ctx.globalCompositeOperation = 'source-over'
}

/** Empty TipTap doc with a full-width ink pad ready to draw. */
export function emptyPaintSketchDoc(title = 'Skica'): {
  type: 'doc'
  content: Array<Record<string, unknown>>
} {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: title }],
      },
      {
        type: 'paintPad',
        attrs: {
          strokes: PAINT_EMPTY_STROKES,
          background: PAINT_DEFAULT_BG,
          width: PAINT_DEFAULT_WIDTH,
          height: 480,
          ocrText: '',
        },
      },
      { type: 'paragraph' },
    ],
  }
}
