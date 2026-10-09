import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HANDOFF_TARGET,
  handoffsToMemoryContext,
  parseHandoffGoal,
} from '@/lib/library/agent-handoff'
import { matchAgentIntentsSync } from '@/lib/library/agent'

describe('parseHandoffGoal', () => {
  it('parses english handoff targets', () => {
    const parsed = parseHandoffGoal(
      'handoff to organizer: three action items from standup',
      'meeting',
    )
    expect(parsed).toEqual({
      toAgentId: 'organizer',
      summary: 'three action items from standup',
    })
  })

  it('parses @mention and slovak send', () => {
    expect(parseHandoffGoal('@librarian Cite related notes', 'general')?.toAgentId).toBe(
      'librarian',
    )
    expect(parseHandoffGoal('pošli proofreaderovi check -ise endings', 'meeting')?.toAgentId).toBe(
      'proofreader',
    )
  })

  it('uses default peer when goal is a handoff without explicit target', () => {
    const parsed = parseHandoffGoal('handoff the action items', 'meeting')
    expect(parsed?.toAgentId).toBe(DEFAULT_HANDOFF_TARGET.meeting)
  })

  it('rejects same-agent or empty goals', () => {
    expect(parseHandoffGoal('summarize this note', 'meeting')).toBeNull()
    expect(parseHandoffGoal('handoff to meeting: hello', 'meeting')).toBeNull()
  })
})

describe('handoffsToMemoryContext', () => {
  it('injects pending inbox only', () => {
    const ctx = handoffsToMemoryContext([
      {
        id: '1',
        fromAgentId: 'meeting',
        toAgentId: 'organizer',
        summary: 'Ship the checklist',
        status: 'pending',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: '2',
        fromAgentId: 'study',
        toAgentId: 'organizer',
        summary: 'Old',
        status: 'acknowledged',
        createdAt: 1,
        updatedAt: 1,
      },
    ])
    expect(ctx).toHaveLength(1)
    expect(ctx[0]?.text).toContain('Ship the checklist')
    expect(ctx[0]?.text).not.toContain('Old')
  })
})

describe('handoff intent', () => {
  it('matches handoff tool from goal text', () => {
    expect(matchAgentIntentsSync('Handoff to organizer: follow up todos')).toContain('handoff')
    expect(matchAgentIntentsSync('pošli organizerovi action items')).toContain('handoff')
  })
})
