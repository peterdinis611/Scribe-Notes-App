import { describe, expect, it } from 'vitest'
import { tiptapToPlainText } from '@/lib/export/plain-text'

describe('tiptapToPlainText', () => {
  it('extracts plain text from paragraphs and lists', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Prvý riadok' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Odrážka' }] }],
            },
          ],
        },
      ],
    })

    expect(tiptapToPlainText(json)).toBe('Prvý riadok\n\n- Odrážka')
  })

  it('exports chart and mermaid blocks with fenced source', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'd3Chart',
          attrs: {
            source: '{"type":"bar","title":"Q1","data":[{"month":"Jan","value":1}]}',
          },
        },
        {
          type: 'mermaidDiagram',
          attrs: { source: 'flowchart TD\n  A --> B' },
        },
      ],
    })

    const plain = tiptapToPlainText(json)
    expect(plain).toContain('[Chart: Q1]')
    expect(plain).toContain('```chart')
    expect(plain).toContain('[Mermaid]')
    expect(plain).toContain('```mermaid')
  })

  it('returns empty string for invalid json', () => {
    expect(tiptapToPlainText('{')).toBe('')
  })
})
