import { describe, expect, it } from 'vitest'
import { buildDiagnosticReport, extractErrorDetails } from '@/lib/errors/report'

describe('extractErrorDetails', () => {
  it('reads Error name, message, and stack', () => {
    const error = new Error('Boom')
    error.name = 'ReferenceError'
    const details = extractErrorDetails(error, ' in SmartFoldersSection')
    expect(details.name).toBe('ReferenceError')
    expect(details.message).toBe('Boom')
    expect(details.stack).toContain('Error')
    expect(details.componentStack).toContain('SmartFoldersSection')
  })

  it('accepts bare string errors', () => {
    const details = extractErrorDetails("  Can't find variable: X  ")
    expect(details.name).toBe('Error')
    expect(details.message).toBe("Can't find variable: X")
    expect(details.stack).toBeNull()
  })

  it('stringifies plain objects', () => {
    const details = extractErrorDetails({ code: 42 })
    expect(details.message).toContain('42')
  })
})

describe('buildDiagnosticReport', () => {
  it('includes version, route, and optional stacks', () => {
    const report = buildDiagnosticReport({
      appVersion: '2.4.0',
      details: {
        name: 'TypeError',
        message: 'x is not a function',
        stack: 'TypeError: x is not a function\n    at foo',
        componentStack: 'at Sidebar',
      },
      route: '/doc/abc',
      locale: 'sk',
      when: '2026-09-26T08:00:00.000Z',
    })
    expect(report).toContain('Scribe 2.4.0')
    expect(report).toContain('Route: /doc/abc')
    expect(report).toContain('Locale: sk')
    expect(report).toContain('TypeError')
    expect(report).toContain('── Stack ──')
    expect(report).toContain('── Component stack ──')
    expect(report).toContain('at Sidebar')
  })
})
