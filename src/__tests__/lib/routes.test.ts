import { describe, expect, it } from 'vitest'
import { isSettingsSection, ROUTES } from '@/lib/routes'

describe('isSettingsSection', () => {
  it('accepts known sections', () => {
    expect(isSettingsSection('appearance')).toBe(true)
    expect(isSettingsSection('nlp')).toBe(true)
    expect(isSettingsSection('capture')).toBe(true)
    expect(isSettingsSection('about')).toBe(true)
  })

  it('rejects unknown values', () => {
    expect(isSettingsSection(undefined)).toBe(false)
    expect(isSettingsSection('nope')).toBe(false)
  })
})

describe('ROUTES', () => {
  it('builds home / document / docs routes', () => {
    expect(ROUTES.home()).toEqual({ to: '/' })
    expect(ROUTES.document('abc')).toEqual({
      to: '/doc/$documentId',
      params: { documentId: 'abc' },
    })
    expect(ROUTES.docs()).toEqual({ to: '/docs' })
  })

  it('builds graph search and settings section paths', () => {
    expect(ROUTES.graph()).toEqual({ to: '/graph', search: {} })
    expect(ROUTES.graph({ around: true })).toEqual({
      to: '/graph',
      search: { around: true },
    })
    expect(ROUTES.settingsSection('nlp')).toEqual({ to: '/settings/nlp' })
  })
})
