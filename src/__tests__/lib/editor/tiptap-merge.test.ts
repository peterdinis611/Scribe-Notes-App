import { describe, expect, it } from 'vitest'
import { mergeTiptapJson } from '@/lib/editor/tiptap-merge'

function doc(...blocks: unknown[]) {
  return JSON.stringify({ type: 'doc', content: blocks })
}

describe('mergeTiptapJson', () => {
  it('keeps shared LCS blocks once and concatenates divergent hunks', () => {
    const shared = { type: 'paragraph', content: [{ type: 'text', text: 'shared' }] }
    const appOnly = { type: 'paragraph', content: [{ type: 'text', text: 'app' }] }
    const diskOnly = { type: 'paragraph', content: [{ type: 'text', text: 'disk' }] }
    const merged = mergeTiptapJson(doc(shared, appOnly), doc(shared, diskOnly), 'both')
    expect(merged).toBeTruthy()
    const parsed = JSON.parse(merged!) as { content: Array<{ content?: Array<{ text?: string }> }> }
    const texts = parsed.content.map((block) => block.content?.[0]?.text)
    expect(texts).toEqual(['shared', 'app', 'disk'])
  })

  it('can prefer app-only divergent hunks', () => {
    const a = { type: 'paragraph', content: [{ type: 'text', text: 'a' }] }
    const b = { type: 'paragraph', content: [{ type: 'text', text: 'b' }] }
    const merged = mergeTiptapJson(doc(a), doc(b), 'app')
    const parsed = JSON.parse(merged!) as { content: Array<{ content?: Array<{ text?: string }> }> }
    expect(parsed.content.map((block) => block.content?.[0]?.text)).toEqual(['a'])
  })
})
