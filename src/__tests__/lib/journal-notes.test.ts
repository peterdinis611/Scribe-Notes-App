import { describe, expect, it } from 'vitest'
import { formatDateKey, formatWeekKey } from '@/lib/journal-notes'

describe('journal date keys', () => {
  it('formats daily keys as YYYY-MM-DD', () => {
    expect(formatDateKey(new Date(2026, 6, 24))).toBe('2026-07-24')
  })

  it('formats ISO week keys', () => {
    expect(formatWeekKey(new Date(Date.UTC(2026, 0, 5)))).toMatch(/^2026-W\d{2}$/)
  })
})
