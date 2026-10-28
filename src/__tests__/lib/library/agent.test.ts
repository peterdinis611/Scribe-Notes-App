import { describe, expect, it, vi } from 'vitest'
import {
  planAgentGoal,
  runAgentGoal,
  agentMemoryContext,
  suggestFollowupRecipes,
} from '@/lib/library/agent'
import {
  buildAgentGoalChips,
  buildAgentToolOptions,
} from '@/lib/library/agent-suggestions'
import type { NlpDocumentAnalysis, DocumentTask } from '@/lib/db/nlp-api'
import { invokeMatchAgentIntents } from '@/lib/db/api'

vi.mock('@/lib/db/api', () => ({
  invokeMatchAgentIntents: vi.fn(async () => {
    throw new Error('no tauri')
  }),
  invokeMatchDocumentChatIntent: vi.fn(async () => null),
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

  it('plans multi-step document tools via Rust intent fallback', async () => {
    vi.mocked(invokeMatchAgentIntents).mockResolvedValueOnce(['summarize', 'similar'])
    const { DEFAULT_AGENT_PREFS } = await import('@/lib/library/agent-prefs')
    const plan = await planAgentGoal(
      'Summarize and find related notes',
      'document',
      'doc-1',
      { ...DEFAULT_AGENT_PREFS, preferFast: false, askWhenUncertain: false },
    )
    expect(plan.tools[0]).toBe('summarize')
    expect(plan.tools).toContain('similar')
  })

  it('recipe soft-cap keeps full meeting_wrap tools', async () => {
    const { DEFAULT_AGENT_PREFS } = await import('@/lib/library/agent-prefs')
    const plan = await planAgentGoal('meeting wrap', 'document', 'doc-1', {
      ...DEFAULT_AGENT_PREFS,
      maxSteps: 2,
      preferFast: false,
    }, { recipeId: 'meeting_wrap' })
    expect(plan.tools.length).toBeGreaterThanOrEqual(3)
    expect(plan.tools).toContain('meeting')
    expect(plan.planMeta?.source).toBe('recipe')
  })
})

describe('runAgentGoal', () => {
  it('merges soft-fail steps', async () => {
    vi.mocked(invokeMatchAgentIntents).mockResolvedValueOnce(['summarize', 'similar'])
    const { DEFAULT_AGENT_PREFS } = await import('@/lib/library/agent-prefs')
    const result = await runAgentGoal(
      'Summarize and find related notes',
      'document',
      'doc-1',
      undefined,
      { ...DEFAULT_AGENT_PREFS, preferFast: false, askWhenUncertain: false },
    )
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

describe('suggestFollowupRecipes', () => {
  it('suggests code_pass after code_brief / explain', () => {
    const ids = suggestFollowupRecipes(
      [
        { tool: 'code_brief', status: 'ok' },
        { tool: 'explain', status: 'ok' },
      ],
      'document',
    )
    expect(ids).toContain('code_pass')
  })

  it('suggests wiki_cleanup after wiki_health', () => {
    const ids = suggestFollowupRecipes(
      [{ tool: 'wiki_health', status: 'ok' }],
      'document',
    )
    expect(ids).toContain('wiki_cleanup')
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
    expect(chips.length).toBeGreaterThan(5)
    expect(chips.some((chip) => /Ship plan|Goals|Risks|Alex|Friday|Write release/i.test(chip))).toBe(
      true,
    )
    expect(chips.some((chip) => /launch window|ship/i.test(chip))).toBe(true)
    expect(chips.some((chip) => /finish|Prioritize|tasks/i.test(chip))).toBe(true)
  })

  it('names concrete note signals in chips', () => {
    const chips = buildAgentGoalChips(analysis, tasks, { title: 'Ship plan', slovak: true })
    expect(chips.some((chip) => chip.includes('Ship plan') || chip.includes('Goals'))).toBe(true)
    expect(chips.some((chip) => chip.includes('Write release') || chip.includes('úloh'))).toBe(true)
  })

  it('ranks tools with open tasks higher', () => {
    const tools = buildAgentToolOptions(analysis, tasks)
    expect(tools[0]).toBe('summarize')
    expect(tools).toContain('tasks')
    expect(tools).toContain('dates')
    expect(tools.indexOf('tasks')).toBeLessThan(tools.indexOf('meeting'))
  })
})
