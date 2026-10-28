import { describe, expect, it } from 'vitest'
import {
  agentSlashQuery,
  filterAgentSlashCommands,
  isAgentSlashMenuOpen,
  parseAgentSlash,
  seedAgentSlashCatalogForTests,
  slashCommandAllowedForRole,
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
  {
    id: 'handoff',
    name: 'handoff',
    aliases: ['posli'],
    labelKey: 'agent.slash.handoff.label',
    hintKey: 'agent.slash.handoff.hint',
    scopes: ['any'],
    tools: ['handoff'],
    passArgs: true,
  },
  {
    id: 'ingest',
    name: 'ingest',
    aliases: ['import'],
    labelKey: 'agent.slash.ingest.label',
    hintKey: 'agent.slash.ingest.hint',
    scopes: ['library', 'any'],
    recipeId: 'files_learn',
  },
  {
    id: 'code',
    name: 'code',
    labelKey: 'agent.slash.code.label',
    hintKey: 'agent.slash.code.hint',
    scopes: ['document', 'any'],
    tools: ['code_brief'],
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

  it('scopes slash suggestions to the active dock role', () => {
    seedAgentSlashCatalogForTests(FIXTURE)
    const meetingOnly = filterAgentSlashCommands('', 'document', 20, 'meeting')
    expect(meetingOnly.some((c) => c.id === 'meeting')).toBe(true)
    expect(meetingOnly.some((c) => c.id === 'wrap')).toBe(true)
    expect(meetingOnly.some((c) => c.id === 'talk')).toBe(false)
    const studyOnly = filterAgentSlashCommands('', 'document', 20, 'study')
    expect(studyOnly.some((c) => c.id === 'meeting')).toBe(false)
  })

  it('allows handoff and code for developer; ingest for librarian', () => {
    seedAgentSlashCatalogForTests(FIXTURE)
    const handoff = FIXTURE.find((c) => c.id === 'handoff')!
    const code = FIXTURE.find((c) => c.id === 'code')!
    const ingest = FIXTURE.find((c) => c.id === 'ingest')!
    expect(slashCommandAllowedForRole(handoff, 'developer')).toBe(true)
    expect(slashCommandAllowedForRole(code, 'developer')).toBe(true)
    expect(slashCommandAllowedForRole(ingest, 'developer')).toBe(false)
    expect(slashCommandAllowedForRole(ingest, 'librarian')).toBe(true)
    expect(slashCommandAllowedForRole(code, 'general')).toBe(true)
  })

  it('parses expanded slash aliases from seeded catalog', () => {
    seedAgentSlashCatalogForTests(FIXTURE)
    expect(parseAgentSlash('/posli organizer: triage', 'document', t)).toMatchObject({
      forceTools: ['handoff'],
      goal: 'organizer: triage',
    })
    expect(parseAgentSlash('/import', 'library', t)).toMatchObject({
      recipeId: 'files_learn',
    })
  })
})
