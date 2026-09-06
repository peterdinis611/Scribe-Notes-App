import { describe, expect, it } from 'vitest'
import {
  emptyCanvasDocument,
  isCanvasContent,
  parseCanvasDocument,
  serializeCanvasDocument,
} from '@/lib/canvas/types'

describe('isCanvasContent', () => {
  it('accepts valid canvas documents', () => {
    expect(isCanvasContent(emptyCanvasDocument())).toBe(true)
    expect(
      isCanvasContent({
        type: 'canvas',
        cards: [],
        edges: [],
      }),
    ).toBe(true)
  })

  it('rejects non-canvas payloads', () => {
    expect(isCanvasContent(null)).toBe(false)
    expect(isCanvasContent({ type: 'doc', content: [] })).toBe(false)
    expect(isCanvasContent({ type: 'canvas', cards: [] })).toBe(false)
  })
})

describe('parseCanvasDocument / serializeCanvasDocument', () => {
  it('round-trips a document with cards and edges', () => {
    const source = {
      type: 'canvas',
      version: 1,
      cards: [{ id: 'c1', x: 10, y: 20, w: 200, h: 120, text: 'Hello' }],
      edges: [{ id: 'e1', from: 'c1', to: 'c2' }],
    }
    const parsed = parseCanvasDocument(JSON.stringify(source))
    expect(parsed).not.toBeNull()
    expect(parsed?.cards).toHaveLength(1)
    expect(parsed?.cards[0]?.text).toBe('Hello')
    expect(parsed?.edges).toHaveLength(1)

    const again = parseCanvasDocument(serializeCanvasDocument(parsed!))
    expect(again?.cards[0]?.id).toBe('c1')
    expect(again?.edges[0]?.from).toBe('c1')
  })

  it('normalizes bad card sizes and drops invalid edges', () => {
    const parsed = parseCanvasDocument(
      JSON.stringify({
        type: 'canvas',
        cards: [{ id: 'c1', x: 0, y: 0, w: 10, h: 10, text: 'x' }],
        edges: [
          { id: 'loop', from: 'c1', to: 'c1' },
          { id: 'ok', from: 'c1', to: 'c2' },
          { from: '', to: 'c2' },
        ],
      }),
    )
    expect(parsed?.cards[0]?.w).toBeGreaterThan(40)
    expect(parsed?.cards[0]?.h).toBeGreaterThan(40)
    expect(parsed?.edges.map((edge) => edge.id)).toEqual(['ok'])
  })

  it('returns null for invalid JSON or non-canvas content', () => {
    expect(parseCanvasDocument('{')).toBeNull()
    expect(parseCanvasDocument(JSON.stringify({ type: 'doc' }))).toBeNull()
  })
})
