import { describe, expect, it } from 'vitest'
import {
  canvasObjectsToPlainText,
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
    expect(
      isCanvasContent({
        type: 'canvas',
        version: 2,
        objects: [],
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
    expect(parsed?.version).toBe(2)
    expect(parsed?.cards).toHaveLength(1)
    expect(parsed?.objects).toHaveLength(1)
    expect(parsed?.objects[0]?.kind).toBe('note')
    expect(parsed?.objects[0]?.opacity).toBe(1)
    expect(parsed?.cards[0]?.text).toBe('Hello')
    expect(parsed?.edges).toHaveLength(1)

    const again = parseCanvasDocument(serializeCanvasDocument(parsed!))
    expect(again?.cards[0]?.id).toBe('c1')
    expect(again?.objects[0]?.id).toBe('c1')
    expect(again?.edges[0]?.from).toBe('c1')
  })

  it('parses v2 shape, line, arrow, and docLink objects', () => {
    const parsed = parseCanvasDocument(
      JSON.stringify({
        type: 'canvas',
        version: 2,
        cards: [],
        objects: [
          {
            id: 'r1',
            kind: 'rect',
            x: 0,
            y: 0,
            w: 160,
            h: 120,
            zIndex: 0,
            text: '',
            label: '',
            fill: 'red',
            stroke: 'blue',
            strokeWidth: 2,
            fontSize: 14,
            color: 'black',
            opacity: 0.8,
            cornerRadius: 12,
            groupId: 'g1',
          },
          {
            id: 'a1',
            kind: 'arrow',
            x: 10,
            y: 10,
            w: 120,
            h: 24,
            zIndex: 1,
          },
          {
            id: 'd1',
            kind: 'docLink',
            x: 20,
            y: 20,
            w: 220,
            h: 64,
            zIndex: 2,
            documentId: 'doc-1',
            documentTitle: 'Brief',
          },
        ],
        edges: [],
      }),
    )
    expect(parsed?.objects.map((o) => o.kind)).toEqual(['rect', 'arrow', 'docLink'])
    expect(parsed?.objects[0]?.opacity).toBe(0.8)
    expect(parsed?.objects[0]?.groupId).toBe('g1')
    expect(parsed?.objects[2]?.documentId).toBe('doc-1')
    expect(parsed?.cards).toHaveLength(0)
  })

  it('exports plain text from notes and doc links', () => {
    const text = canvasObjectsToPlainText([
      {
        id: '1',
        kind: 'note',
        x: 0,
        y: 0,
        w: 100,
        h: 80,
        zIndex: 0,
        text: 'Alpha',
        label: '',
        fill: '',
        stroke: '',
        strokeWidth: 1,
        fontSize: 14,
        color: '',
        opacity: 1,
        cornerRadius: 0,
        rotation: 0,
        groupId: '',
        parentId: '',
        documentId: '',
        documentTitle: '',
        points: [],
      },
      {
        id: '2',
        kind: 'docLink',
        x: 0,
        y: 0,
        w: 100,
        h: 80,
        zIndex: 1,
        text: '',
        label: '',
        fill: '',
        stroke: '',
        strokeWidth: 1,
        fontSize: 14,
        color: '',
        opacity: 1,
        cornerRadius: 0,
        rotation: 0,
        groupId: '',
        parentId: '',
        documentId: 'd',
        documentTitle: 'Linked',
        points: [],
      },
    ])
    expect(text).toContain('Alpha')
    expect(text).toContain('Linked')
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
