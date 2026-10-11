import { describe, expect, it } from 'vitest'
import { alignNodes } from '@/lib/canvas/align'
import { createObjectNode } from '@/lib/canvas/flow'

describe('alignNodes', () => {
  it('aligns left edges', () => {
    const a = { ...createObjectNode('note', { x: 100, y: 0 }, 0), position: { x: 100, y: 0 }, width: 100, height: 80 }
    const b = { ...createObjectNode('note', { x: 40, y: 120 }, 1), position: { x: 40, y: 120 }, width: 100, height: 80 }
    const next = alignNodes([a, b], new Set([a.id, b.id]), 'left')
    expect(next.find((n) => n.id === a.id)?.position.x).toBe(40)
    expect(next.find((n) => n.id === b.id)?.position.x).toBe(40)
  })
})
