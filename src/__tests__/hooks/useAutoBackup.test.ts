import { describe, expect, it } from 'vitest'
import { isBackupDue } from '@/hooks/useAutoBackup'

describe('isBackupDue', () => {
  it('is due when never backed up', () => {
    expect(isBackupDue(null, 7)).toBe(true)
  })

  it('is due after the interval', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    expect(isBackupDue(eightDaysAgo, 7)).toBe(true)
  })

  it('is not due within the interval', () => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
    expect(isBackupDue(oneDayAgo, 7)).toBe(false)
  })
})
