import { describe, expect, it } from 'vitest'
import { promoteMarkdownSpecialBlocks } from '@/lib/editor/markdown-promote'
import { tiptapJsonToHtml } from '@/lib/export/html'

describe('promoteMarkdownSpecialBlocks', () => {
  it('promotes mermaid and math fenced code blocks', () => {
    const promoted = promoteMarkdownSpecialBlocks({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'mermaid' },
          content: [{ type: 'text', text: 'flowchart TD\n  A --> B' }],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'math' },
          content: [{ type: 'text', text: '1 + 2' }],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'js' },
          content: [{ type: 'text', text: 'console.log(1)' }],
        },
      ],
    })

    expect(promoted.content?.[0]).toMatchObject({
      type: 'mermaidDiagram',
      attrs: { source: 'flowchart TD\n  A --> B' },
    })
    expect(promoted.content?.[1]).toMatchObject({
      type: 'mathBlock',
      attrs: { expression: '1 + 2' },
    })
    expect(promoted.content?.[2]?.type).toBe('codeBlock')
  })
})

describe('tiptapJsonToHtml rich blocks', () => {
  it('exports wiki links, callouts and footnotes', () => {
    const html = tiptapJsonToHtml(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'See ' },
              { type: 'wikiLink', attrs: { label: 'Notes', targetId: '1' } },
              { type: 'footnote', attrs: { id: 'fn1', number: 1, content: 'Source note' } },
            ],
          },
          {
            type: 'callout',
            attrs: { variant: 'tip' },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Helpful tip' }] }],
          },
        ],
      }),
      'Doc',
      { includeTitleHeading: false },
    )

    expect(html).toContain('[[Notes]]')
    expect(html).toContain('data-callout')
    expect(html).toContain('Helpful tip')
    expect(html).toContain('Source note')
    expect(html).toContain('id="fn-fn1"')
  })

  it('falls back mermaid to source pre without svg map', () => {
    const html = tiptapJsonToHtml(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'mermaidDiagram',
            attrs: { source: 'flowchart TD\n  A --> B' },
          },
        ],
      }),
      'Doc',
      { includeTitleHeading: false },
    )

    expect(html).toContain('mermaid-diagram')
    expect(html).toContain('flowchart TD')
  })
})
