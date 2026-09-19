import { describe, expect, it } from 'vitest'
import { mergeChapters } from '@/lib/library/compile-chapters'

function paragraph(text: string) {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  }
}

describe('mergeChapters', () => {
  it('prefixes each chapter with a heading and concatenates TipTap content', () => {
    const json = mergeChapters([
      {
        title: 'One',
        contentJson: JSON.stringify({ type: 'doc', content: [paragraph('alpha')] }),
      },
      {
        title: 'Two',
        contentJson: JSON.stringify({ type: 'doc', content: [paragraph('beta')] }),
      },
    ])

    const doc = JSON.parse(json) as { type: string; content: Array<{ type: string; attrs?: { level?: number }; content?: Array<{ text?: string }> }> }
    expect(doc.type).toBe('doc')
    expect(doc.content).toHaveLength(4)
    expect(doc.content[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'One' }],
    })
    expect(doc.content[1]).toMatchObject(paragraph('alpha'))
    expect(doc.content[2]).toMatchObject({
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Two' }],
    })
    expect(doc.content[3]).toMatchObject(paragraph('beta'))
  })

  it('falls back to a paragraph when content JSON is invalid', () => {
    const doc = JSON.parse(mergeChapters([{ title: 'Broken', contentJson: 'not-json' }])) as {
      content: Array<{ type: string; content?: Array<{ text?: string }> }>
    }
    expect(doc.content[1]).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'not-json' }],
    })
  })

  it('returns an empty document for no chapters', () => {
    expect(mergeChapters([])).toBe(JSON.stringify({ type: 'doc', content: [] }))
  })
})
