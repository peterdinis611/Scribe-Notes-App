import { describe, expect, it } from 'vitest'
import { collectHeadingsFromJson } from '@/lib/search/palette-headings'

describe('collectHeadingsFromJson', () => {
  it('collects nested heading labels in order', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Intro' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Body' }],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [
            { type: 'text', text: 'Part ' },
            { type: 'text', text: 'Two' },
          ],
        },
      ],
    })
    expect(collectHeadingsFromJson(json)).toEqual(['Intro', 'Part Two'])
  })

  it('skips empty headings and invalid JSON', () => {
    expect(
      collectHeadingsFromJson(
        JSON.stringify({
          type: 'doc',
          content: [{ type: 'heading', attrs: { level: 1 }, content: [] }],
        }),
      ),
    ).toEqual([])
    expect(collectHeadingsFromJson('{')).toEqual([])
  })
})
