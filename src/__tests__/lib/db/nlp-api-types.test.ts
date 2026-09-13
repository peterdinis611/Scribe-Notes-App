import { describe, expect, it } from 'vitest'
import type { NlpDiffSummary, NlpTemplateFillHints } from '@/lib/db/nlp-api'

describe('nlp result shapes used by UI', () => {
  it('accepts typed diff summary fields', () => {
    const summary: NlpDiffSummary = {
      summary: 'Added deadlines.',
      addedSentences: ['Ship by Friday.'],
      removedSentences: ['Old plan.'],
      gainedTerms: ['friday'],
      lostTerms: ['plan'],
      changeRatio: 0.4,
      oldWordCount: 10,
      newWordCount: 12,
    }
    expect(summary.addedSentences).toHaveLength(1)
    expect(summary.changeRatio).toBeGreaterThan(0)
  })

  it('accepts typed template fill hints', () => {
    const hints: NlpTemplateFillHints = {
      expected: ['Goal', 'Context'],
      present: ['Goal'],
      missing: ['Context'],
      coverage: 0.5,
      complete: false,
    }
    expect(hints.missing).toContain('Context')
    expect(hints.complete).toBe(false)
  })
})
