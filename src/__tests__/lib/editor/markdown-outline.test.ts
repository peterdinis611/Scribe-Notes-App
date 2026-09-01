import { describe, expect, it } from 'vitest'
import { collectMarkdownHeadingOutline } from '@/lib/editor/markdown-outline'

describe('collectMarkdownHeadingOutline', () => {
  it('collects ATX headings with depth and preview', () => {
    const markdown = '# Title\n\nBody\n\n## Section two'
    const items = collectMarkdownHeadingOutline(markdown)

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      kind: 'heading',
      preview: 'Title',
      depth: 0,
      pos: 0,
    })
    expect(items[1]).toMatchObject({
      preview: 'Section two',
      depth: 1,
    })
  })
})
