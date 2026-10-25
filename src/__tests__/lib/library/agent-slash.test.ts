import { describe, expect, it } from 'vitest'
import {
  filterAgentSlashCommands,
  isAgentSlashMenuOpen,
  parseAgentSlash,
  toolsForSlashCommand,
} from '@/lib/library/agent-slash'

const t = (key: string) => key

describe('agent-slash', () => {
  it('parses /talk with a question', () => {
    const parsed = parseAgentSlash('/talk What is the deadline?', 'document', t)
    expect(parsed).toMatchObject({
      goal: 'What is the deadline?',
      forceTools: ['document_answer'],
      args: 'What is the deadline?',
    })
  })

  it('maps /talk to library Q&A outside document scope', () => {
    const parsed = parseAgentSlash('/talk themes?', 'library', t)
    expect(parsed).toMatchObject({
      forceTools: ['library_answer'],
      goal: 'themes?',
    })
  })

  it('parses aliases and recipes', () => {
    const meeting = parseAgentSlash('/porada', 'document', t)
    expect(meeting).toMatchObject({ forceTools: ['meeting'] })

    const wrap = parseAgentSlash('/wrap', 'document', t)
    expect(wrap).toMatchObject({ recipeId: 'meeting_wrap' })

    const plan = parseAgentSlash('/planuj', 'document', t)
    expect(plan).toMatchObject({ forceTools: ['forward_plan'] })
  })

  it('returns unknown for bad tokens', () => {
    expect(parseAgentSlash('/nope', 'document', t)).toEqual({
      unknown: true,
      token: 'nope',
    })
  })

  it('ignores non-slash goals', () => {
    expect(parseAgentSlash('summarize this', 'document', t)).toBeNull()
  })

  it('filters autocomplete by query and scope', () => {
    const hits = filterAgentSlashCommands('mee', 'document')
    expect(hits.some((c) => c.id === 'meeting')).toBe(true)
    expect(isAgentSlashMenuOpen('/mee')).toBe(true)
    expect(isAgentSlashMenuOpen('/meeting more')).toBe(false)
  })

  it('resolves talk tools by scope', () => {
    expect(toolsForSlashCommand(
      { id: 'talk', name: 'talk', labelKey: '', hintKey: '', scopes: ['any'], tools: ['document_answer'] },
      'library',
    )).toEqual(['library_answer'])
  })
})
