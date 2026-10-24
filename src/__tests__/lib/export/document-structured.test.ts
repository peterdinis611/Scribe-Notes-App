import { describe, expect, it } from 'vitest'
import { documentToOpml, documentToStructuredJson } from '@/lib/export/document-structured'

const sample = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Hello' }],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'World' }],
    },
  ],
})

describe('document-structured', () => {
  it('exports structured json with blocks', () => {
    const out = JSON.parse(documentToStructuredJson(sample, 'Note'))
    expect(out.format).toBe('scribe-structured')
    expect(out.blocks).toEqual([
      { type: 'heading', text: 'Hello', level: 1 },
      { type: 'paragraph', text: 'World' },
    ])
  })

  it('exports opml outline', () => {
    const opml = documentToOpml(sample, 'Note')
    expect(opml).toContain('<opml version="2.0">')
    expect(opml).toContain('text="Hello"')
    expect(opml).toContain('text="World"')
  })
})
