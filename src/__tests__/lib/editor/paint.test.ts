import { describe, expect, it } from 'vitest'
import {
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
})
