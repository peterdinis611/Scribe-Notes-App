/** Freehand paint pad — TipTap atom attrs + stroke helpers. */

export type PaintTool = 'pen' | 'eraser'

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

function normalizeStroke(value: unknown): PaintStroke | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const tool = row.tool === 'eraser' ? 'eraser' : 'pen'
  const color = typeof row.color === 'string' && row.color ? row.color : PAINT_DEFAULT_COLOR
  const width =
    typeof row.width === 'number' && Number.isFinite(row.width)
      ? Math.max(1, Math.min(48, row.width))
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
