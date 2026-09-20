import { describe, expect, it } from 'vitest'
import { mergeDuplicateContent } from '@/lib/library/merge-duplicates'

describe('mergeDuplicateContent', () => {
  it('appends the dropped note under a heading', () => {
    const keep = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep body' }] }],
    })
    const drop = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Drop body' }] }],
    })
    const merged = JSON.parse(mergeDuplicateContent(keep, drop, 'Copy of keep')) as {
      content: Array<{ type: string; content?: Array<{ text?: string }> }>
    }
    expect(merged.content[0]?.type).toBe('paragraph')
    expect(merged.content[1]?.type).toBe('horizontalRule')
    expect(merged.content[2]?.content?.[0]?.text).toBe('Copy of keep')
    expect(JSON.stringify(merged)).toContain('Drop body')
  })
})
