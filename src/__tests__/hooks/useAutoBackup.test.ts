import { describe, expect, it } from 'vitest'
import { backupCheckIntervalMs, isBackupDue, nextBackupAt } from '@/hooks/useAutoBackup'

describe('isBackupDue', () => {
  it('is due when never backed up', () => {
    expect(isBackupDue(null, 168)).toBe(true)
  })

  it('is due after the interval in hours', () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
    expect(isBackupDue(twoHoursAgo, 1)).toBe(true)
  })

  it('is not due within the interval', () => {
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000
    expect(isBackupDue(thirtyMinutesAgo, 1)).toBe(false)
  })

  it('treats weekly interval as 168 hours', () => {
    const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000
    expect(isBackupDue(sixDaysAgo, 168)).toBe(false)
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    expect(isBackupDue(eightDaysAgo, 168)).toBe(true)
  })
})

describe('backupCheckIntervalMs', () => {
  it('polls more often for short cadences', () => {
    expect(backupCheckIntervalMs(1)).toBe(5 * 60 * 1000)
    expect(backupCheckIntervalMs(6)).toBe(15 * 60 * 1000)
    expect(backupCheckIntervalMs(168)).toBe(60 * 60 * 1000)
  })
})

describe('nextBackupAt', () => {
  it('returns now when never backed up', () => {
    const before = Date.now()
    const next = nextBackupAt(null, 24)
    expect(next).toBeGreaterThanOrEqual(before)
  })
})
