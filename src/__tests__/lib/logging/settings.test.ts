import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOGGING_SETTINGS,
  DEFAULT_QUIET_LOG_TARGETS,
  DEFAULT_RING_CAPACITY,
  LOGGING_ENV_KEYS,
  LOGGING_SCOPES,
  normalizeLoggingSettings,
  parseLoggingLevel,
} from '@/lib/logging/settings'

describe('logging settings (scribe-logging mirror)', () => {
  it('parses level aliases like the Rust crate', () => {
    expect(parseLoggingLevel('')).toBe('info')
    expect(parseLoggingLevel('DEBUG')).toBe('debug')
    expect(parseLoggingLevel('1')).toBe('debug')
    expect(parseLoggingLevel('true')).toBe('debug')
    expect(parseLoggingLevel('warning')).toBe('warn')
    expect(parseLoggingLevel('0')).toBe('off')
    expect(parseLoggingLevel('false')).toBe('off')
    expect(parseLoggingLevel('trace')).toBe('trace')
    expect(parseLoggingLevel('scribe=debug,tao=warn')).toBe('debug')
    expect(parseLoggingLevel('app=trace')).toBe('trace')
    expect(parseLoggingLevel('mystery')).toBe('info')
  })

  it('normalizes partial settings with clamps and defaults', () => {
    const s = normalizeLoggingSettings({
      level: 'TRACE',
      ringCapacity: 8,
      quietTargets: ['tao', ' TAO ', '', 'wry'],
      moduleLevels: [
        { target: '  ', level: 'debug' },
        { target: ' scribe.db ', level: 'WARNING' },
      ],
      filePath: '  /tmp/scribe.log  ',
      mirrorFrontend: false,
      colors: false,
    })
    expect(s.level).toBe('trace')
    expect(s.ringCapacity).toBe(32)
    expect(s.quietTargets).toEqual(['tao', 'wry'])
    expect(s.moduleLevels).toEqual([{ target: 'scribe.db', level: 'warn' }])
    expect(s.filePath).toBe('/tmp/scribe.log')
    expect(s.mirrorFrontend).toBe(false)
    expect(s.colors).toBe(false)
    expect(s.stderr).toBe(true)
  })

  it('falls back to default quiet targets when empty', () => {
    const s = normalizeLoggingSettings({ quietTargets: [] })
    expect(s.quietTargets).toEqual([...DEFAULT_QUIET_LOG_TARGETS])
  })

  it('clamps oversized ring and clears blank file path', () => {
    const s = normalizeLoggingSettings({
      ringCapacity: 99_999,
      filePath: '   ',
    })
    expect(s.ringCapacity).toBe(10_000)
    expect(s.filePath).toBeNull()
  })

  it('treats nullish input as defaults', () => {
    expect(normalizeLoggingSettings(null)).toEqual(DEFAULT_LOGGING_SETTINGS)
    expect(normalizeLoggingSettings(undefined).ringCapacity).toBe(DEFAULT_RING_CAPACITY)
  })

  it('keeps env keys and scopes aligned with the crate', () => {
    expect(LOGGING_ENV_KEYS[0]).toBe('SCRIBE_RUST_LOG')
    expect(LOGGING_ENV_KEYS).toContain('SCRIBE_LOG_FILE')
    expect(LOGGING_SCOPES).toContain('scribe.logging')
    expect(LOGGING_SCOPES).toContain('scribe.fe.diagnostics')
    expect(new Set(LOGGING_SCOPES).size).toBe(LOGGING_SCOPES.length)
  })

  it('defaults mirror frontend on unless explicitly false', () => {
    expect(normalizeLoggingSettings({}).mirrorFrontend).toBe(true)
    expect(normalizeLoggingSettings({ mirrorFrontend: true }).mirrorFrontend).toBe(true)
    expect(normalizeLoggingSettings({ mirrorFrontend: false }).mirrorFrontend).toBe(false)
  })
})
