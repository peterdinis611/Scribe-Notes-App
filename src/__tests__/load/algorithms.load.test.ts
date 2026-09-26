/**
 * Frontend algorithm load smoke (no Tauri IPC).
 *
 * Default: small profile for CI.
 * Heavy: SCRIBE_LOAD=1 bunx vitest run src/__tests__/load
 */
import { describe, expect, it } from 'vitest'
import { parsePaintStrokes, serializePaintStrokes, type PaintStroke } from '@/lib/editor/paint'
import { tiptapToPlainText } from '@/lib/export/plain-text'

function loadEnabled() {
  return ['1', 'true', 'yes'].includes(String(process.env.SCRIBE_LOAD ?? '').toLowerCase())
}

function profile() {
  if (loadEnabled()) {
    return {
      docs: 2_000,
      paragraphs: 30,
      paintStrokes: 400,
      pointsPerStroke: 80,
      maxPlainMs: 2_500,
      maxPaintMs: 800,
    }
  }
  return {
    docs: 120,
    paragraphs: 6,
    paintStrokes: 40,
    pointsPerStroke: 20,
    maxPlainMs: 800,
    maxPaintMs: 250,
  }
}

function tipTapDoc(title: string, paragraphs: number): string {
  const nodes = [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: title }],
    },
    ...Array.from({ length: paragraphs }, (_, index) => ({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `Paragraph ${index} deadlines wiki Acme for ${title}.`,
        },
      ],
    })),
  ]
  return JSON.stringify({ type: 'doc', content: nodes })
}

describe('load: frontend algorithms', () => {
  it('converts many TipTap docs to plain text under budget', () => {
    const p = profile()
    const docs = Array.from({ length: p.docs }, (_, i) => tipTapDoc(`Note ${i}`, p.paragraphs))
    const started = performance.now()
    let chars = 0
    for (const json of docs) {
      chars += tiptapToPlainText(json).length
    }
    const ms = performance.now() - started
    // eslint-disable-next-line no-console
    console.log(`[load-fe] plain-text docs=${p.docs} chars=${chars} in ${ms.toFixed(1)}ms`)
    expect(chars).toBeGreaterThan(p.docs * 20)
    expect(ms).toBeLessThan(p.maxPlainMs)
  })

  it('serializes a dense paint pad under budget', () => {
    const p = profile()
    const strokes: PaintStroke[] = Array.from({ length: p.paintStrokes }, (_, s) => ({
      tool: s % 7 === 0 ? 'eraser' : 'pen',
      color: '#1a1814',
      width: 3,
      points: Array.from({ length: p.pointsPerStroke }, (_, i) => ({
        x: i * 2 + s,
        y: Math.sin(i / 3) * 40 + s,
      })),
    }))
    const started = performance.now()
    const raw = serializePaintStrokes(strokes)
    const parsed = parsePaintStrokes(raw)
    const ms = performance.now() - started
    // eslint-disable-next-line no-console
    console.log(`[load-fe] paint strokes=${p.paintStrokes} bytes=${raw.length} in ${ms.toFixed(1)}ms`)
    expect(parsed).toHaveLength(p.paintStrokes)
    expect(ms).toBeLessThan(p.maxPaintMs)
  })
})
