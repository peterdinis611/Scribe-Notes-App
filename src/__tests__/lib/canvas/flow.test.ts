import { describe, expect, it } from 'vitest'
import {
  canvasEdgesToFlow,
  cardsToNodes,
  flowToCanvasDocument,
} from '@/lib/canvas/flow'

describe('canvas ↔ React Flow mapping', () => {
  it('round-trips cards and edges', () => {
    const nodes = cardsToNodes([
      { id: 'c1', x: 40, y: 80, w: 200, h: 120, text: 'Alpha' },
    ])
    const edges = canvasEdgesToFlow([{ id: 'e1', from: 'c1', to: 'c2' }])
    const doc = flowToCanvasDocument(nodes, edges)

    expect(doc.type).toBe('canvas')
    expect(doc.cards[0]).toMatchObject({ id: 'c1', x: 40, y: 80, text: 'Alpha' })
    expect(doc.edges[0]).toEqual({ id: 'e1', from: 'c1', to: 'c2' })
  })

  it('drops self-loop edges', () => {
    const doc = flowToCanvasDocument([], [{ id: 'loop', source: 'a', target: 'a' }])
    expect(doc.edges).toEqual([])
  })
})
