import { describe, expect, it } from 'vitest'
import { APP_VERSION } from '@/lib/app-version'

describe('APP_VERSION', () => {
  it('is a semver major.minor.patch string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('matches the 1.9 release line', () => {
    expect(APP_VERSION.startsWith('1.9.')).toBe(true)
  })
})
