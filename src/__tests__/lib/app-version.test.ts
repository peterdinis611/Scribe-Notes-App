import { describe, expect, it } from 'vitest'
import { APP_SHORT_VERSION, APP_VERSION } from '@/lib/app-version'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
  version: string
}

describe('APP_VERSION', () => {
  it('is a semver major.minor.patch string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('matches the 2.4 release line', () => {
    expect(APP_VERSION.startsWith('2.4.')).toBe(true)
    expect(APP_SHORT_VERSION).toBe('2.4')
  })

  it('stays in sync with package.json', () => {
    expect(APP_VERSION).toBe(pkg.version)
  })
})
