import { describe, expect, it } from 'vitest'
import { createObjectNode } from '@/lib/canvas/flow'
import { snapNodePosition } from '@/lib/canvas/snap'

describe('snapNodePosition', () => {
  it('snaps left edges together', () => {
    const a = {
      ...createObjectNode('note', { x: 100, y: 0 }, 0),
      position: { x: 100, y: 0 },
      width: 100,
      height: 80,
    }
    const b = {
      ...createObjectNode('note', { x: 40, y: 120 }, 1),
      position: { x: 40, y: 120 },
      width: 100,
      height: 80,
    }
    const result = snapNodePosition(a, [a, b], { x: 42, y: 0 }, 8)
    expect(result.position.x).toBe(40)
    expect(result.guides.some((g) => g.orientation === 'x')).toBe(true)
  })
})
