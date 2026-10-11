import { describe, expect, it } from 'vitest'
import {
  canvasEdgesToFlow,
  cardsToNodes,
  createObjectNode,
  flowToCanvasDocument,
  objectsToNodes,
} from '@/lib/canvas/flow'

describe('canvas ↔ React Flow mapping', () => {
  it('round-trips cards and edges', () => {
    const nodes = cardsToNodes([
      { id: 'c1', x: 40, y: 80, w: 200, h: 120, text: 'Alpha' },
    ])
    const edges = canvasEdgesToFlow([{ id: 'e1', from: 'c1', to: 'c2' }])
    const doc = flowToCanvasDocument(nodes, edges)

    expect(doc.type).toBe('canvas')
    expect(doc.version).toBe(2)
    expect(doc.cards[0]).toMatchObject({ id: 'c1', x: 40, y: 80, text: 'Alpha' })
    expect(doc.objects[0]).toMatchObject({ id: 'c1', kind: 'note', text: 'Alpha' })
    expect(doc.edges[0]).toEqual({ id: 'e1', from: 'c1', to: 'c2' })
  })

  it('maps shape objects', () => {
    const nodes = objectsToNodes([
      {
        id: 'r1',
        kind: 'rect',
        x: 10,
        y: 20,
        w: 160,
        h: 120,
        zIndex: 2,
        text: 'Box',
        label: '',
        fill: 'var(--color-surface)',
        stroke: 'var(--color-accent)',
        strokeWidth: 1.5,
        fontSize: 14,
        color: 'var(--color-foreground)',
      },
    ])
    expect(nodes[0]?.type).toBe('rect')
    const doc = flowToCanvasDocument(nodes, [])
    expect(doc.objects[0]?.kind).toBe('rect')
    expect(doc.cards).toHaveLength(0)
  })

  it('creates centered object nodes', () => {
    const node = createObjectNode('ellipse', { x: 100, y: 100 }, 3)
    expect(node.type).toBe('ellipse')
    expect(node.data.kind).toBe('ellipse')
    expect(node.data.zIndex).toBe(3)
  })

  it('drops self-loop edges', () => {
    const doc = flowToCanvasDocument([], [{ id: 'loop', source: 'a', target: 'a' }])
    expect(doc.edges).toEqual([])
  })
})
