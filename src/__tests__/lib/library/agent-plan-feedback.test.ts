import { afterEach, describe, expect, it } from 'vitest'
import {
  clearPlanFeedback,
  listSuccessfulPlanTools,
  recordPlanFeedback,
} from '@/lib/library/agent-plan-feedback'

describe('agent-plan-feedback', () => {
  afterEach(() => {
    clearPlanFeedback()
  })

  it('records apply and returns tool sets for JEPA boost', () => {
    recordPlanFeedback({
      goal: 'Meeting wrap-up',
      tools: ['meeting', 'tasks'],
      outcome: 'apply',
      roleId: 'meeting',
      source: 'jepa',
    })
    recordPlanFeedback({
      goal: 'Spell polish',
      tools: ['spellcheck'],
      outcome: 'dismiss',
      roleId: 'proofreader',
    })
    const wins = listSuccessfulPlanTools()
    expect(wins).toEqual([['meeting', 'tasks']])
  })
})
