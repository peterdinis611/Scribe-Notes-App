import { describe, expect, it } from 'vitest'
import {
  createCustomRecipe,
  normalizeAgentPrefs,
  DEFAULT_AGENT_PREFS,
} from '@/lib/library/agent-prefs'
import { resolveAgentRecipe } from '@/lib/library/agent-recipes'
import { shouldRunDigestNow } from '@/lib/library/agent-digest-schedule'

describe('custom recipes + digest schedule', () => {
  it('normalizes digest schedule and custom recipes', () => {
    const prefs = normalizeAgentPrefs({
      ...DEFAULT_AGENT_PREFS,
      digestSchedule: { enabled: true, timeLocal: '9:5', period: 'week', weekday: 2 },
      customRecipes: [
        { id: 'c1', label: 'Wrap', tools: ['meeting', 'tasks', 'bogus'] },
        { id: 'bad', label: '', tools: ['summarize'] },
      ],
    })
    expect(prefs.digestSchedule.timeLocal).toBe('09:05')
    expect(prefs.digestSchedule.period).toBe('week')
    expect(prefs.customRecipes).toHaveLength(1)
    expect(prefs.customRecipes[0]?.tools).toEqual(['meeting', 'tasks'])
  })

  it('resolves built-in and custom recipes', () => {
    const custom = createCustomRecipe({
      label: 'My flash',
      tools: ['flashcards', 'quiz'],
      documentPreferred: true,
    })
    expect(custom).not.toBeNull()
    const resolved = resolveAgentRecipe(custom!.id, [custom!])
    expect(resolved?.custom).toBe(true)
    expect(resolved?.tools).toEqual(['flashcards', 'quiz'])
    expect(resolveAgentRecipe('daily_digest')?.labelKey).toBeTruthy()
  })

  it('gates digest ticker by time and last run', () => {
    const now = new Date('2026-10-09T08:00:00')
    expect(
      shouldRunDigestNow(
        { enabled: true, timeLocal: '08:00', period: 'day', weekday: 1, lastRunDate: '' },
        now,
      ),
    ).toBe(true)
    expect(
      shouldRunDigestNow(
        {
          enabled: true,
          timeLocal: '08:00',
          period: 'day',
          weekday: 1,
          lastRunDate: '2026-10-09',
        },
        now,
      ),
    ).toBe(false)
  })
})
