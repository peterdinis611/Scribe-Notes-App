import { describe, expect, it } from 'vitest'
import { parseCargoLockAppVersion } from '../../../scripts/check-version-sync'

describe('parseCargoLockAppVersion', () => {
  it('reads the app version from CRLF Windows lockfiles', () => {
    const crlf = ['[[package]]', 'name = "app"', 'version = "2.0.0"', ''].join('\r\n')
    expect(parseCargoLockAppVersion(crlf)).toBe('2.0.0')
  })
})
