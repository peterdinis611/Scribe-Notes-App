import { describe, expect, it } from 'vitest'
import {
  emptyPaintSketchDoc,
  parsePaintStrokes,
  serializePaintStrokes,
  type PaintStroke,
} from '@/lib/editor/paint'

describe('paint strokes', () => {
  it('round-trips strokes JSON', () => {
    const strokes: PaintStroke[] = [
      {
        tool: 'pen',
        color: '#1a1814',
        width: 3,
        points: [
          { x: 1, y: 2 },
          { x: 4, y: 6 },
        ],
      },
    ]
    const raw = serializePaintStrokes(strokes)
    expect(parsePaintStrokes(raw)).toEqual(strokes)
  })

  it('drops invalid strokes', () => {
    expect(parsePaintStrokes('not-json')).toEqual([])
    expect(parsePaintStrokes('[{"tool":"pen","points":[]}]')).toEqual([])
  })

  it('normalizes highlighter and marker aliases', () => {
    const raw = serializePaintStrokes([
      {
        tool: 'highlighter',
        color: '#facc15',
        width: 18,
        points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      },
    ])
    expect(parsePaintStrokes(raw)[0]?.tool).toBe('highlighter')
    expect(parsePaintStrokes('[{"tool":"marker","color":"#fb7185","width":12,"points":[{"x":1,"y":1}]}]')[0]?.tool).toBe(
      'highlighter',
    )
  })

  it('builds an empty sketch document with a paint pad', () => {
    const doc = emptyPaintSketchDoc('Skica')
    expect(doc.type).toBe('doc')
    expect(doc.content.some((node) => node.type === 'paintPad')).toBe(true)
  })
})
