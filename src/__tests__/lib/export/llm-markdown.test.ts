import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stripMarkdownFences, generateMarkdownWithLlm } from '@/lib/export/llm-markdown'

vi.mock('@/lib/db/nlp-api', () => ({
  nlpLlmComplete: vi.fn(),
}))

import { nlpLlmComplete } from '@/lib/db/nlp-api'

const sampleDoc = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Hello world' }],
    },
  ],
})

describe('stripMarkdownFences', () => {
  it('unwraps fenced markdown blocks', () => {
    expect(stripMarkdownFences('```markdown\n# Title\n\nBody\n```')).toBe('# Title\n\nBody')
    expect(stripMarkdownFences('```md\nHi\n```')).toBe('Hi')
  })

  it('leaves bare markdown alone', () => {
    expect(stripMarkdownFences('# Already clean')).toBe('# Already clean')
  })
})

describe('generateMarkdownWithLlm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns LLM text when completion succeeds', async () => {
    vi.mocked(nlpLlmComplete).mockResolvedValue({
      requestId: '1',
      text: '```markdown\n# Note\n\nPolished body\n```',
      model: 'llama',
      streamed: false,
    })

    const result = await generateMarkdownWithLlm({
      contentJson: sampleDoc,
      title: 'Note',
    })

    expect(result.enhanced).toBe(true)
    expect(result.markdown).toContain('Polished body')
    expect(result.model).toBe('llama')
  })

  it('falls back to deterministic markdown when LLM fails', async () => {
    vi.mocked(nlpLlmComplete).mockRejectedValue(new Error('offline'))

    const result = await generateMarkdownWithLlm({
      contentJson: sampleDoc,
      title: 'Note',
    })

    expect(result.enhanced).toBe(false)
    expect(result.markdown).toContain('Hello world')
  })
})
