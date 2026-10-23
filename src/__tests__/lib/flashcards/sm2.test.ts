import { describe, expect, it } from 'vitest'
import { defaultSm2State, isDue, reviewSm2 } from '@/lib/flashcards/sm2'

describe('sm2', () => {
  it('schedules again for 10 minutes', () => {
    const now = Date.UTC(2026, 9, 23, 12, 0, 0)
    const next = reviewSm2(defaultSm2State(now), 'again', now)
    expect(next.repetitions).toBe(0)
    expect(next.dueAt).toBe(now + 10 * 60 * 1000)
    expect(isDue(next, now + 11 * 60 * 1000)).toBe(true)
  })

  it('grows interval on good reviews', () => {
    const now = Date.UTC(2026, 9, 23, 12, 0, 0)
    let state = defaultSm2State(now)
    state = reviewSm2(state, 'good', now)
    expect(state.interval).toBe(1)
    state = reviewSm2(state, 'good', state.dueAt)
    expect(state.interval).toBe(6)
    state = reviewSm2(state, 'good', state.dueAt)
    expect(state.interval).toBeGreaterThanOrEqual(10)
  })
})
