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
    expect(doc.objects[0]).toMatchObject({ id: 'c1', kind: 'note', text: 'Alpha', opacity: 1 })
    expect(doc.edges[0]).toEqual({ id: 'e1', from: 'c1', to: 'c2' })
  })

  it('maps shape and line objects with viewport', () => {
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
        opacity: 0.9,
        cornerRadius: 8,
        rotation: 0,
        groupId: '',
        documentId: '',
        documentTitle: '',
      },
      {
        id: 'l1',
        kind: 'line',
        x: 0,
        y: 0,
        w: 120,
        h: 24,
        zIndex: 1,
        text: '',
        label: '',
        fill: 'transparent',
        stroke: 'var(--color-accent)',
        strokeWidth: 2,
        fontSize: 12,
        color: 'var(--color-foreground)',
        opacity: 1,
        cornerRadius: 0,
        rotation: 0,
        groupId: '',
        documentId: '',
        documentTitle: '',
      },
    ])
    expect(nodes[0]?.type).toBe('line')
    expect(nodes[1]?.type).toBe('rect')
    const doc = flowToCanvasDocument(nodes, [], { x: 1, y: 2, zoom: 1.25 })
    expect(doc.objects.map((o) => o.kind).sort()).toEqual(['line', 'rect'])
    expect(doc.viewport).toEqual({ x: 1, y: 2, zoom: 1.25 })
  })

  it('creates centered object nodes', () => {
    const node = createObjectNode('ellipse', { x: 100, y: 100 }, 3)
    expect(node.type).toBe('ellipse')
    expect(node.data.kind).toBe('ellipse')
    expect(node.data.zIndex).toBe(3)
    expect(node.data.opacity).toBe(1)
  })

  it('drops self-loop edges', () => {
    const doc = flowToCanvasDocument([], [{ id: 'loop', source: 'a', target: 'a' }])
    expect(doc.edges).toEqual([])
  })
})
