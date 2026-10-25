import { describe, expect, it } from 'vitest'
import {
  agentSlashQuery,
  filterAgentSlashCommands,
  isAgentSlashMenuOpen,
  parseAgentSlash,
  seedAgentSlashCatalogForTests,
  type AgentSlashCommand,
} from '@/lib/library/agent-slash'

const t = (key: string) => key

const FIXTURE: AgentSlashCommand[] = [
  {
    id: 'talk',
    name: 'talk',
    aliases: ['ask', 'hovor'],
    labelKey: 'agent.slash.talk.label',
    hintKey: 'agent.slash.talk.hint',
    scopes: ['any'],
    tools: ['document_answer'],
    passArgs: true,
    defaultGoalKey: 'agent.slash.talk.defaultGoal',
  },
  {
    id: 'meeting',
    name: 'meeting',
    aliases: ['porada'],
    labelKey: 'agent.slash.meeting.label',
    hintKey: 'agent.slash.meeting.hint',
    scopes: ['document', 'any'],
    tools: ['meeting'],
    defaultGoalKey: 'agent.tools.meeting',
  },
  {
    id: 'wrap',
    name: 'wrap',
    labelKey: 'agent.slash.wrap.label',
    hintKey: 'agent.slash.wrap.hint',
    scopes: ['document', 'any'],
    recipeId: 'meeting_wrap',
  },
  {
    id: 'plan',
    name: 'plan',
    aliases: ['planuj'],
    labelKey: 'agent.slash.plan.label',
    hintKey: 'agent.slash.plan.hint',
    scopes: ['document', 'any'],
    tools: ['forward_plan'],
    defaultGoalKey: 'agent.tools.forward_plan',
  },
]

describe('agent-slash (TS thin layer over cached Rust catalog)', () => {
  it('parses from seeded catalog', () => {
    seedAgentSlashCatalogForTests(FIXTURE)
    expect(parseAgentSlash('/talk What is the deadline?', 'document', t)).toMatchObject({
      goal: 'What is the deadline?',
      forceTools: ['document_answer'],
    })
    expect(parseAgentSlash('/talk themes?', 'library', t)).toMatchObject({
      forceTools: ['library_answer'],
    })
    expect(parseAgentSlash('/porada', 'document', t)).toMatchObject({
      forceTools: ['meeting'],
    })
    expect(parseAgentSlash('/wrap', 'document', t)).toMatchObject({
      recipeId: 'meeting_wrap',
    })
    expect(parseAgentSlash('/planuj', 'document', t)).toMatchObject({
      forceTools: ['forward_plan'],
    })
    expect(parseAgentSlash('/nope', 'document', t)).toEqual({ unknown: true, token: 'nope' })
    expect(parseAgentSlash('summarize this', 'document', t)).toBeNull()
  })

  it('filters autocomplete and menu helpers', () => {
    seedAgentSlashCatalogForTests(FIXTURE)
    expect(filterAgentSlashCommands('mee', 'document').some((c) => c.id === 'meeting')).toBe(true)
    expect(isAgentSlashMenuOpen('/mee')).toBe(true)
    expect(isAgentSlashMenuOpen('/meeting more')).toBe(false)
    expect(agentSlashQuery('/plan ahead')).toBe('plan')
  })
})
