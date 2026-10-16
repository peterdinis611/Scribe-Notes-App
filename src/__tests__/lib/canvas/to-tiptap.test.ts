import { describe, expect, it } from 'vitest'
import { createCanvasObject } from '@/lib/canvas/types'
import { canvasObjectsToTiptapDoc } from '@/lib/canvas/to-tiptap'

describe('canvasObjectsToTiptapDoc', () => {
  it('converts notes and docLinks into TipTap blocks', () => {
    const note = createCanvasObject('note', { x: 0, y: 0 }, 0)
    note.text = 'Hello\nWorld'
    const link = createCanvasObject('docLink', { x: 0, y: 0 }, 1, {
      documentId: 'doc-1',
      documentTitle: 'Brief',
    })
    const doc = canvasObjectsToTiptapDoc([note, link])
    expect(doc.type).toBe('doc')
    expect(doc.content).toHaveLength(3)
    expect(doc.content?.[2]).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'wikiLink', attrs: { targetId: 'doc-1', label: 'Brief' } }],
    })
  })
})
