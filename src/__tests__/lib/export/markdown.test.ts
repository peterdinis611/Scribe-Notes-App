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

  it('exports math and mermaid blocks as fenced code', () => {
    const markdown = tiptapJsonToMarkdown(
      JSON.stringify({
        type: 'doc',
        content: [
          { type: 'mathBlock', attrs: { expression: '1 + 2' } },
          { type: 'mermaidDiagram', attrs: { source: 'sequenceDiagram\n  A->>B: Hi' } },
        ],
      }),
      'Doc',
    )

    expect(markdown).toContain('```math\n1 + 2\n```')
    expect(markdown).toContain('```mermaid\nsequenceDiagram\n  A->>B: Hi\n```')
  })
})
