import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_TEACH_DRAFT_MAX_LEN,
  distillTeachingWithLlm,
} from '@/lib/library/agent-teach'
import { AGENT_TEACHING_MAX_LEN } from '@/lib/library/agent-prefs'

const nlpLlmStatus = vi.fn()
const nlpLlmComplete = vi.fn()

vi.mock('@/lib/db/nlp-api', () => ({
  nlpLlmStatus: (...args: unknown[]) => nlpLlmStatus(...args),
  nlpLlmComplete: (...args: unknown[]) => nlpLlmComplete(...args),
}))

describe('distillTeachingWithLlm', () => {
  beforeEach(() => {
    nlpLlmStatus.mockReset()
    nlpLlmComplete.mockReset()
  })

  it('keeps short text without calling the LLM', async () => {
    nlpLlmStatus.mockResolvedValue({ reachable: true })
    const result = await distillTeachingWithLlm('Prefer Slovak answers')
    expect(result).toEqual({ text: 'Prefer Slovak answers', distilled: false })
    expect(nlpLlmComplete).not.toHaveBeenCalled()
  })

  it('distills long text when Ollama is reachable', async () => {
    nlpLlmStatus.mockResolvedValue({ reachable: true })
    nlpLlmComplete.mockResolvedValue({
      requestId: 'x',
      text: 'Always answer in Slovak and put deadlines first.',
      model: 'llama',
      streamed: false,
    })
    const long = 'A'.repeat(AGENT_TEACHING_MAX_LEN + 40)
    const result = await distillTeachingWithLlm(long)
    expect(result.distilled).toBe(true)
    expect(result.text.length).toBeLessThanOrEqual(AGENT_TEACHING_MAX_LEN)
    expect(result.text).toContain('Slovak')
    expect(nlpLlmComplete).toHaveBeenCalledOnce()
  })

  it('falls back to a trim when LLM is offline', async () => {
    nlpLlmStatus.mockResolvedValue({ reachable: false })
    const long = `Note: ${'x'.repeat(AGENT_TEACH_DRAFT_MAX_LEN)}`
    const result = await distillTeachingWithLlm(long)
    expect(result.distilled).toBe(false)
    expect(result.text.length).toBe(AGENT_TEACHING_MAX_LEN)
    expect(nlpLlmComplete).not.toHaveBeenCalled()
  })
})
