import { describe, expect, it, vi } from 'vitest'
import { withNlpTimeout } from '@/lib/nlp/timeout'

describe('withNlpTimeout', () => {
  it('resolves when the promise finishes in time', async () => {
    await expect(withNlpTimeout(Promise.resolve(42), 200)).resolves.toBe(42)
  })

  it('rejects with timeout when the promise stalls', async () => {
    vi.useFakeTimers()
    const stalled = new Promise<number>(() => undefined)
    const pending = withNlpTimeout(stalled, 50)
    const assertion = expect(pending).rejects.toThrow('timeout')
    await vi.advanceTimersByTimeAsync(50)
    await assertion
    vi.useRealTimers()
  })
})
