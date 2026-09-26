import { describe, expect, it } from 'vitest'
import {
  applyAgentOptimize,
  createTeaching,
  normalizeAgentPrefs,
  teachingsToMemoryContext,
  DEFAULT_AGENT_PREFS,
} from '@/lib/library/agent-prefs'
import { planAgentGoal, runAgentGoal } from '@/lib/library/agent'
import { vi } from 'vitest'

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
    askLibrary: vi.fn(async () => ({ answer: 'library hit', citations: [] })),
    askDocument: vi.fn(async () => ({ answer: 'doc hit', citations: [] })),
    runDocumentChatAction: vi.fn(async (_id: string, action: string) => ({
      answer: `action:${action}`,
      citations: [],
    })),
  }
})

describe('normalizeAgentPrefs / teach', () => {
  it('defaults enabled with max 3 steps', () => {
    const prefs = normalizeAgentPrefs({})
    expect(prefs.enabled).toBe(true)
    expect(prefs.maxSteps).toBe(3)
    expect(prefs.teachings).toEqual([])
  })

  it('creates and injects teachings', () => {
    const teaching = createTeaching('Prefer Slovak answers')
    expect(teaching?.text).toBe('Prefer Slovak answers')
    const ctx = teachingsToMemoryContext([teaching!])
    expect(ctx[0].text).toContain('Prefer Slovak answers')
  })
})

describe('applyAgentOptimize', () => {
  it('caps steps and drops heavy tools when preferFast', () => {
    const tools = applyAgentOptimize(['summarize', 'similar', 'flashcards', 'style'], {
      maxSteps: 2,
      preferFast: true,
      preferredTools: [],
      disabledTools: [],
      quietHours: false,
    })
    expect(tools).toEqual(['summarize'])
  })

  it('boosts preferred and removes disabled', () => {
    const tools = applyAgentOptimize(['summarize', 'tasks', 'outline'], {
      maxSteps: 3,
      preferFast: false,
      preferredTools: ['tasks'],
      disabledTools: ['outline'],
      quietHours: false,
    })
    expect(tools[0]).toBe('tasks')
    expect(tools).not.toContain('outline')
  })
})

describe('agent runtime prefs', () => {
  it('refuses to run when disabled', async () => {
    await expect(
      planAgentGoal('Summarize', 'document', 'doc-1', {
        ...DEFAULT_AGENT_PREFS,
        enabled: false,
      }),
    ).rejects.toThrow('agent.disabled')
  })

  it('respects maxSteps=1', async () => {
    const plan = await planAgentGoal(
      'Summarize and find related notes plus flashcards',
      'document',
      'doc-1',
      { ...DEFAULT_AGENT_PREFS, maxSteps: 1 },
    )
    expect(plan.tools).toHaveLength(1)
  })

  it('asks when uncertain instead of guessing', async () => {
    const plan = await planAgentGoal('What themes appear?', 'library', null, {
      ...DEFAULT_AGENT_PREFS,
      askWhenUncertain: true,
    })
    expect(plan.needsClarification).toBe(true)
    expect(plan.tools).toEqual([])
  })

  it('passes teachings into document answer context', async () => {
    const { askDocument } = await import('@/lib/library/library-chat')
    await runAgentGoal('What is this about?', 'document', 'doc-1', [], {
      ...DEFAULT_AGENT_PREFS,
      askWhenUncertain: false,
      teachings: [{ id: 't1', text: 'Focus on deadlines', createdAt: 1 }],
    })
    expect(askDocument).toHaveBeenCalled()
    const call = vi.mocked(askDocument).mock.calls.at(-1)
    const context = call?.[2] as Array<{ text: string }>
    expect(context.some((item) => item.text.includes('Focus on deadlines'))).toBe(true)
  })
})
