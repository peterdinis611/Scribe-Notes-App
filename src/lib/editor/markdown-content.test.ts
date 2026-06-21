import { describe, expect, it } from 'vitest'
import {
  parseMarkdownToContentJson,
  serializeContentJsonToMarkdown,
  titleFromMarkdown,
} from '@/lib/editor/markdown-content'

describe('markdown-content', () => {
  it('parses headings and lists into tiptap json', () => {
    const json = parseMarkdownToContentJson('# Nadpis\n\n- položka\n- druhá')
    const doc = JSON.parse(json) as { content: Array<{ type: string }> }
    expect(doc.content.some((node) => node.type === 'heading')).toBe(true)
    expect(doc.content.some((node) => node.type === 'bulletList')).toBe(true)
  })

  it('round-trips basic markdown', () => {
    const source = '## Sekcia\n\n**Tučný** text'
    const json = parseMarkdownToContentJson(source)
    const markdown = serializeContentJsonToMarkdown(json)
    expect(markdown).toContain('## Sekcia')
    expect(markdown).toContain('**Tučný**')
  })

  it('extracts title from first heading', () => {
    expect(titleFromMarkdown('# Môj dokument\n\nText', 'fallback')).toBe('Môj dokument')
    expect(titleFromMarkdown('Bez nadpisu', 'fallback')).toBe('fallback')
  })
})
