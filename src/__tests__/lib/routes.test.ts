import { describe, expect, it } from 'vitest'
import { isSettingsSection, ROUTES, type SettingsSection } from '@/lib/routes'

/** Mirrors `scribe_ui::settings_section_ids` — keep in sync with crates/scribe-ui. */
const RUST_SETTINGS_SECTION_IDS = [
  'appearance',
  'interface',
  'storage',
  'shortcuts',
  'diagnostics',
  'mcp',
  'nlp',
  'agent',
  'capture',
  'privacy',
  'about',
] as const satisfies readonly SettingsSection[]

describe('isSettingsSection', () => {
  it('accepts known sections', () => {
    expect(isSettingsSection('appearance')).toBe(true)
    expect(isSettingsSection('interface')).toBe(true)
    expect(isSettingsSection('nlp')).toBe(true)
    expect(isSettingsSection('agent')).toBe(true)
    expect(isSettingsSection('capture')).toBe(true)
    expect(isSettingsSection('about')).toBe(true)
    expect(isSettingsSection('privacy')).toBe(true)
  })

  it('rejects unknown values', () => {
    expect(isSettingsSection(undefined)).toBe(false)
    expect(isSettingsSection('nope')).toBe(false)
  })

  it('matches Rust settings section id list', () => {
    for (const id of RUST_SETTINGS_SECTION_IDS) {
      expect(isSettingsSection(id)).toBe(true)
    }
    expect(RUST_SETTINGS_SECTION_IDS).toHaveLength(11)
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
    expect(ROUTES.settingsSection('interface')).toEqual({ to: '/settings/interface' })
    expect(ROUTES.settingsSection('agent')).toEqual({ to: '/settings/agent' })
    expect(ROUTES.plugins()).toEqual({ to: '/plugins' })
  })
})
