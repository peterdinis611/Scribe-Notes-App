import { describe, expect, it } from 'vitest'
import { APP_VERSION } from '@/lib/app-version'

describe('APP_VERSION', () => {
  it('is a semver major.minor.patch string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('matches the 2.0 release line', () => {
    expect(APP_VERSION.startsWith('2.0.')).toBe(true)
  })
})
