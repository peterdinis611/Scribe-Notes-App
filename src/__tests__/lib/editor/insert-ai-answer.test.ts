import { describe, expect, it } from 'vitest'
import {
  applyAgentAnswer,
  stripAnswerMarkdown,
  type AgentApplyMode,
} from '@/lib/editor/insert-ai-answer'

describe('stripAnswerMarkdown', () => {
  it('removes extractive prefix and light markdown', () => {
    const raw = 'Based on this document (Themes):\n• **Ship** the release\n• Finish docs'
    expect(stripAnswerMarkdown(raw)).toBe('Ship the release\nFinish docs')
  })
})

describe('AgentApplyMode', () => {
  it('includes cursor and section modes in the public union', () => {
    const modes: AgentApplyMode[] = ['callout', 'checklist', 'frontmatter', 'cursor', 'section']
    expect(modes).toContain('cursor')
    expect(modes).toContain('section')
    // Without an editor, apply returns false rather than throwing.
    expect(applyAgentAnswer('hello', 'cursor')).toBe(false)
    expect(applyAgentAnswer('hello', 'section', { sectionTitle: 'Brief' })).toBe(false)
  })
})
