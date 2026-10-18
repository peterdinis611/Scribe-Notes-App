import { describe, expect, it } from 'vitest'
import { APP_SHORT_VERSION, APP_VERSION } from '@/lib/app-version'
import pkg from '../../../package.json'

describe('APP_VERSION', () => {
  it('is semver major.minor.patch', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('matches the 4.0 release line', () => {
    expect(APP_VERSION.startsWith('4.0.')).toBe(true)
    expect(APP_SHORT_VERSION).toBe('4.0')
  })

  it('matches package.json', () => {
    expect(APP_VERSION).toBe(pkg.version)
  })
})
