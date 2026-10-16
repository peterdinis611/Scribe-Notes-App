import { describe, expect, it } from 'vitest'
import {
  buildClipboardPayload,
  createCanvasHistory,
  parseClipboardPayload,
} from '@/lib/canvas/history'
import { createObjectNode } from '@/lib/canvas/flow'

describe('canvas history', () => {
  it('undoes and redoes commits', () => {
    const a = createObjectNode('note', { x: 0, y: 0 }, 0)
    const b = createObjectNode('rect', { x: 40, y: 40 }, 1)
    const history = createCanvasHistory({ nodes: [a], edges: [] })
    history.commit({ nodes: [a, b], edges: [] })
    expect(history.present.nodes).toHaveLength(2)
    const undone = history.undo()
    expect(undone?.nodes).toHaveLength(1)
    const redone = history.redo()
    expect(redone?.nodes).toHaveLength(2)
  })

  it('round-trips clipboard payload', () => {
    const node = createObjectNode('note', { x: 10, y: 20 }, 0)
    node.data.text = 'Hello'
    const raw = buildClipboardPayload([node])
    const parsed = parseClipboardPayload(raw)
    expect(parsed?.[0]?.text).toBe('Hello')
    expect(parsed?.[0]?.kind).toBe('note')
  })
})
