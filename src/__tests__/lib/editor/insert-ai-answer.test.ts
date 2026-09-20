import { describe, expect, it } from 'vitest'
import { stripAnswerMarkdown } from '@/lib/editor/insert-ai-answer'

describe('stripAnswerMarkdown', () => {
  it('removes extractive prefix and light markdown', () => {
    const raw = 'Based on this document (Themes):\n• **Ship** the release\n• Finish docs'
    expect(stripAnswerMarkdown(raw)).toBe('Ship the release\nFinish docs')
  })
})
