import { describe, expect, it } from 'vitest'
import { buildCanvasTemplate } from '@/lib/canvas/templates'
import { canvasObjectsToTiptapDoc } from '@/lib/canvas/to-tiptap'
import { serializeCanvasDocument } from '@/lib/canvas/types'

describe('agent canvas helpers', () => {
  it('builds brainstorm template with nested notes', () => {
    const doc = buildCanvasTemplate('brainstorm')
    expect(doc.type).toBe('canvas')
    expect(doc.objects.length).toBeGreaterThan(3)
    expect(doc.objects.some((obj) => obj.kind === 'frame' && obj.label === 'Ideas')).toBe(true)
    expect(doc.objects.some((obj) => obj.parentId)).toBe(true)
  })

  it('serializes template and converts objects to TipTap', () => {
    const doc = buildCanvasTemplate('roadmap')
    const json = serializeCanvasDocument(doc)
    expect(json).toContain('"type":"canvas"')
    const tiptap = canvasObjectsToTiptapDoc(doc.objects)
    expect(tiptap.type).toBe('doc')
    expect(Array.isArray(tiptap.content)).toBe(true)
  })
})
