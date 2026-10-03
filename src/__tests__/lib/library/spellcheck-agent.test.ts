import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/nlp-api', () => ({
  nlpSpellcheck: vi.fn(async () => ({
    language: 'en',
    checkedLanguage: 'en',
    issueCount: 1,
    dictionarySize: 10,
    issues: [
      { word: 'documnet', offset: 0, length: 8, suggestions: ['document', 'documents'] },
    ],
  })),
}))

vi.mock('@/lib/library/agent', () => ({
  agentMemoryContext: (messages: Array<{ role: string; text: string }>) => messages,
  runAgentGoal: vi.fn(async () => ({
    answer: 'Spellcheck found **1** issue(s):\n- **documnet** → document',
    citations: [],
    steps: [
      {
        tool: 'spellcheck',
        status: 'ok',
        spellIssues: [{ word: 'documnet', suggestions: ['document', 'documents'] }],
      },
    ],
    followups: [],
  })),
}))

vi.mock('@/lib/editor/apply-suggestions', () => ({
  applySpellSuggestion: vi.fn(() => true),
}))

import { applySpellcheckFixes, runSpellcheckAgent } from '@/lib/library/spellcheck-agent'
import { applySpellSuggestion } from '@/lib/editor/apply-suggestions'

describe('spellcheck-agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs a spellcheck-only agent pass', async () => {
    const result = await runSpellcheckAgent('doc-1', 'Skontroluj pravopis')
    expect(result.fixes).toEqual([
      {
        word: 'documnet',
        suggestion: 'document',
        alternatives: ['documents'],
      },
    ])
    expect(result.answer).toContain('documnet')
  })

  it('applies fixes via editor helper', () => {
    const applied = applySpellcheckFixes([
      { word: 'documnet', suggestion: 'document', alternatives: [] },
    ])
    expect(applied).toBe(1)
    expect(applySpellSuggestion).toHaveBeenCalledWith('documnet', 'document')
  })
})
