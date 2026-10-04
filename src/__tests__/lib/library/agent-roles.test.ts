import { describe, expect, it } from 'vitest'
import {
  applyAgentOptimize,
  DEFAULT_AGENT_PREFS,
  normalizeAgentPrefs,
} from '@/lib/library/agent-prefs'
import {
  filterToolsByAgents,
  isRecipeAllowedByAgents,
  normalizeAgentRoleId,
  normalizeAgentRoles,
} from '@/lib/library/agent-roles'

describe('agent roles', () => {
  it('normalizes legacy spellcheck persona to proofreader', () => {
    expect(normalizeAgentRoleId('spellcheck')).toBe('proofreader')
    expect(normalizeAgentRoleId('meeting')).toBe('meeting')
  })

  it('defaults all specialists enabled', () => {
    const roles = normalizeAgentRoles(undefined)
    expect(roles.general.enabled).toBe(true)
    expect(roles.proofreader.enabled).toBe(true)
    expect(normalizeAgentPrefs({}).agents.study.enabled).toBe(true)
  })

  it('hides recipes when owner role is off', () => {
    const agents = normalizeAgentRoles({
      study: { enabled: false },
      meeting: { enabled: true },
    })
    expect(isRecipeAllowedByAgents('study_pass', agents)).toBe(false)
    expect(isRecipeAllowedByAgents('meeting_wrap', agents)).toBe(true)
  })

  it('filters tools to enabled specialists', () => {
    const agents = normalizeAgentRoles({
      general: { enabled: false },
      proofreader: { enabled: true },
      librarian: { enabled: false },
      meeting: { enabled: false },
      study: { enabled: false },
      organizer: { enabled: false },
    })
    expect(filterToolsByAgents(['spellcheck', 'brief', 'quiz'], agents)).toEqual(['spellcheck'])
  })

  it('applyAgentOptimize respects disabled roles', () => {
    const prefs = normalizeAgentPrefs({
      ...DEFAULT_AGENT_PREFS,
      agents: {
        ...DEFAULT_AGENT_PREFS.agents,
        study: { enabled: false },
        organizer: { enabled: false },
      },
    })
    const tools = applyAgentOptimize(['quiz', 'flashcards', 'summarize', 'outline'], prefs)
    expect(tools).not.toContain('quiz')
    expect(tools).not.toContain('flashcards')
    expect(tools).toContain('summarize')
  })
})
