import { describe, expect, it } from 'vitest'
import { pdfHighlightsToContentJson, type PdfHighlightsImport } from '@/lib/import/pdf-highlights'

describe('pdfHighlightsToContentJson', () => {
  it('builds a TipTap doc with highlight marks', () => {
    const imported: PdfHighlightsImport = {
      fileName: 'notes.pdf',
      pageCount: 2,
      highlights: [
        { page: 1, text: 'Important line', color: 'rgb(255, 255, 0)', subtype: 'Highlight' },
        { page: 2, text: 'Second page', color: null, subtype: 'Underline' },
      ],
    }
    const doc = pdfHighlightsToContentJson(imported) as {
      type: string
      content: Array<{ type: string; content?: Array<{ marks?: unknown[] }> }>
    }
    expect(doc.type).toBe('doc')
    const highlighted = doc.content.find(
      (node) =>
        node.type === 'paragraph' &&
        node.content?.some((child) => Array.isArray(child.marks) && child.marks.length > 0),
    )
    expect(highlighted).toBeTruthy()
  })
})
