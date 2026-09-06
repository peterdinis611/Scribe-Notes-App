import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import { promoteMarkdownSpecialBlocks } from '@/lib/editor/markdown-promote'

describe('promoteMarkdownSpecialBlocks', () => {
  it('returns empty doc for invalid roots', () => {
    expect(promoteMarkdownSpecialBlocks({ type: 'paragraph' } as JSONContent)).toEqual({
      type: 'doc',
      content: [],
    })
  })

  it('promotes mermaid and math fenced code blocks', () => {
    const doc: JSONContent = {
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
          attrs: { language: 'javascript' },
          content: [{ type: 'text', text: 'console.log(1)' }],
        },
      ],
    }

    const promoted = promoteMarkdownSpecialBlocks(doc)
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

  it('uses a default mermaid flowchart when source is empty', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'MERMAID' },
          content: [],
        },
      ],
    }
    const promoted = promoteMarkdownSpecialBlocks(doc)
    expect(promoted.content?.[0]?.attrs?.source).toContain('flowchart TD')
  })
})
