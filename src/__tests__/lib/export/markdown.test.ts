import { describe, expect, it } from 'vitest'
import { tiptapJsonToMarkdown } from '@/lib/export/markdown'

const sampleDoc = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Sekcia' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Tučný', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' text' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Položka' }] }],
        },
      ],
    },
  ],
})

describe('tiptapJsonToMarkdown', () => {
  it('renders headings, bold text and lists', () => {
    const markdown = tiptapJsonToMarkdown(sampleDoc, 'Dokument')
    expect(markdown).toContain('# Dokument')
    expect(markdown).toContain('## Sekcia')
    expect(markdown).toContain('**Tučný** text')
    expect(markdown).toContain('- Položka')
  })
})
