import { describe, expect, it } from 'vitest'
import {
  decodePhaseFollowup,
  encodePhaseFollowup,
  isWeakAgentAnswer,
  normalizePlanPhases,
  nowToolsFromPhases,
  phasesToFollowups,
} from '@/lib/library/agent-phases'

describe('agent-phases', () => {
  it('encodes and decodes phase followups', () => {
    const token = encodePhaseFollowup({
      when: 'next',
      goal: 'Prioritize tasks',
      tools: ['rank_tasks', 'open_loops'],
      reason: 'Suggested next',
    })
    expect(token).toBeTruthy()
    const decoded = decodePhaseFollowup(token!)
    expect(decoded?.when).toBe('next')
    expect(decoded?.goal).toBe('Prioritize tasks')
    expect(decoded?.tools).toEqual(['rank_tasks', 'open_loops'])
  })

  it('skips now when building followups', () => {
    const chips = phasesToFollowups([
      { when: 'now', goal: 'Summarize', tools: ['summarize'] },
      { when: 'next', goal: 'Open loops', tools: ['open_loops'] },
      { when: 'later', goal: 'Plan ahead', tools: ['forward_plan'] },
    ])
    expect(chips).toHaveLength(2)
    expect(chips.every((c) => c.startsWith('phase:'))).toBe(true)
  })

  it('normalizes phases and picks now tools', () => {
    const phases = normalizePlanPhases(
      [
        { when: 'now', goal: 'Do now', tools: ['summarize', 'tasks'] },
        { when: 'next', goal: 'Later bit', tools: ['open_loops'] },
      ],
      ['document_answer'],
      'goal',
    )
    expect(nowToolsFromPhases(phases, ['document_answer'])).toEqual(['summarize', 'tasks'])
  })

  it('detects weak answers', () => {
    expect(isWeakAgentAnswer('')).toBe(true)
    expect(isWeakAgentAnswer('No commitments detected in this note.')).toBe(true)
    expect(isWeakAgentAnswer('Here are three concrete next steps for the launch.')).toBe(false)
  })
})
