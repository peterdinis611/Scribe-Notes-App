import type { JSONContent } from '@tiptap/core'
import type { CanvasObject } from '@/lib/canvas/types'

/** Convert selected canvas objects into a TipTap document JSON. */
export function canvasObjectsToTiptapDoc(objects: CanvasObject[]): JSONContent {
  const blocks: JSONContent[] = []

  for (const obj of objects) {
    if (obj.kind === 'docLink' && obj.documentId) {
      blocks.push({
        type: 'paragraph',
        content: [
          {
            type: 'wikiLink',
            attrs: {
              targetId: obj.documentId,
              label: obj.documentTitle || obj.documentId,
            },
          },
        ],
      })
      continue
    }
    if (obj.kind === 'frame' && obj.label.trim()) {
      blocks.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: obj.label.trim() }],
      })
      continue
    }
    const text =
      obj.kind === 'text' || obj.kind === 'note' || obj.kind === 'rect' || obj.kind === 'ellipse'
        ? obj.text.trim()
        : ''
    if (!text) continue
    if (obj.kind === 'text') {
      blocks.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text }],
      })
    } else {
      for (const line of text.split(/\n+/)) {
        const trimmed = line.trim()
        if (!trimmed) continue
        blocks.push({
          type: 'paragraph',
          content: [{ type: 'text', text: trimmed }],
        })
      }
    }
  }

  if (blocks.length === 0) {
    blocks.push({ type: 'paragraph' })
  }

  return { type: 'doc', content: blocks }
}
