import { describe, expect, it, vi } from 'vitest'
import {
  AGENT_MAX_STEPS,
  matchAgentIntentsSync,
  planAgentGoal,
  runAgentGoal,
  agentMemoryContext,
} from '@/lib/library/agent'
import {
  buildAgentGoalChips,
  buildAgentToolOptions,
} from '@/lib/library/agent-suggestions'
import type { NlpDocumentAnalysis, DocumentTask } from '@/lib/db/nlp-api'

vi.mock('@/lib/db/api', () => ({
  invokeMatchAgentIntents: vi.fn(async () => {
    throw new Error('no tauri')
  }),
}))

vi.mock('@/lib/db/nlp-api', () => ({
  nlpPlanAgentGoal: vi.fn(async () => {
    throw new Error('no nlp')
  }),
  nlpAgentDocumentBrief: vi.fn(async () => ({
    goal: '',
    tools: [],
    sections: [],
    answer: '',
    count: 0,
    source: 'python',
  })),
}))

vi.mock('@/lib/library/library-chat', async () => {
  const actual = await vi.importActual<typeof import('@/lib/library/library-chat')>(
    '@/lib/library/library-chat',
  )
  return {
    ...actual,
    askLibrary: vi.fn(async () => ({
      answer: 'library hit',
      citations: [{ documentId: 'd1', title: 'A', snippet: 'x' }],
    })),
    askDocument: vi.fn(async () => ({
      answer: 'doc hit',
      citations: [],
    })),
    runDocumentChatAction: vi.fn(async (_id: string, action: string) => ({
      answer: `action:${action}`,
      citations: [],
    })),
  }
})

describe('matchAgentIntentsSync', () => {
  it('collects multiple intents up to max', () => {
    const tools = matchAgentIntentsSync(
      'Summarize this note and find related notes plus flashcards and tasks',
    )
    expect(tools.length).toBeLessThanOrEqual(AGENT_MAX_STEPS)
    expect(tools[0]).toBe('summarize')
    expect(tools).toContain('similar')
  })

  it('returns empty for open questions', () => {
    expect(matchAgentIntentsSync('What is this note mainly about?')).toEqual([])
  })
})

describe('planAgentGoal', () => {
  it('falls back to library_answer when no intents and askWhenUncertain off', async () => {
    const { DEFAULT_AGENT_PREFS } = await import('@/lib/library/agent-prefs')
    const plan = await planAgentGoal('What themes appear?', 'library', null, {
      ...DEFAULT_AGENT_PREFS,
      askWhenUncertain: false,
    })
    expect(plan.tools).toEqual(['library_answer'])
  })

  it('falls back to document_answer in document scope', async () => {
    const { DEFAULT_AGENT_PREFS } = await import('@/lib/library/agent-prefs')
    const plan = await planAgentGoal('What is this about?', 'document', 'doc-1', {
      ...DEFAULT_AGENT_PREFS,
      askWhenUncertain: false,
    })
    expect(plan.tools).toEqual(['document_answer'])
  })

  it('plans multi-step document tools', async () => {
    const plan = await planAgentGoal(
      'Summarize and find related notes',
      'document',
      'doc-1',
    )
    expect(plan.tools[0]).toBe('summarize')
    expect(plan.tools).toContain('similar')
  })

  it('plans dates and meeting intents', async () => {
    expect(matchAgentIntentsSync('What deadlines this week?')).toContain('dates')
    expect(matchAgentIntentsSync('Extract meeting notes pack')).toContain('meeting')
  })
})

describe('runAgentGoal', () => {
  it('merges soft-fail steps', async () => {
    const result = await runAgentGoal('Summarize and find related notes', 'document', 'doc-1')
    expect(result.steps.length).toBeGreaterThanOrEqual(2)
    expect(result.steps.every((step) => step.status === 'ok')).toBe(true)
    expect(result.answer).toContain('summarize')
  })

  it('trims memory context', () => {
    const ctx = agentMemoryContext([
      { role: 'user', text: 'a'.repeat(2000) },
      { role: 'assistant', text: 'b' },
    ])
    expect(ctx).toHaveLength(2)
    expect(ctx[0].text.length).toBeLessThanOrEqual(1200)
  })
})

describe('buildAgentGoalChips / buildAgentToolOptions', () => {
  const tasks: DocumentTask[] = [
    {
      text: 'Write release notes',
      checked: false,
      source: 'checklist',
      dueHint: null,
      documentId: 'doc-1',
      documentTitle: 'Ship plan',
    },
  ]

  const analysis: NlpDocumentAnalysis = {
    language: 'en',
    languageConfidence: 0.9,
    summary: 'A note about shipping',
    suggestedTitle: 'Ship plan',
    outline: [
      { level: 1, title: 'Goals', kind: 'heading' },
      { level: 2, title: 'Risks', kind: 'heading' },
    ],
    keywords: [{ term: 'ship', score: 1, count: 3 }],
    keyphrases: ['launch window'],
    mentions: ['@Alex'],
    dates: [{ text: 'Friday', kind: 'date', resolvedDate: '2026-09-26' }],
    wikiLinks: [],
    hosts: [],
  }

  it('ranks document-aware chips', () => {
    const chips = buildAgentGoalChips(analysis, tasks, { title: 'Ship plan', slovak: false })
    expect(chips.length).toBeGreaterThan(3)
    expect(chips.some((chip) => /summarize|related/i.test(chip))).toBe(true)
    expect(chips.some((chip) => /tasks|takeaways/i.test(chip))).toBe(true)
    expect(chips.some((chip) => /flashcard/i.test(chip))).toBe(true)
  })

  it('ranks tools with open tasks higher', () => {
    const tools = buildAgentToolOptions(analysis, tasks)
    expect(tools[0]).toBe('summarize')
    expect(tools).toContain('tasks')
    expect(tools).toContain('dates')
    expect(tools.indexOf('tasks')).toBeLessThan(tools.indexOf('meeting'))
  })
})
