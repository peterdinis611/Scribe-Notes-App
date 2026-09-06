import { describe, expect, it } from 'vitest'
import { getCodeLanguageLabel, resolveCodeLanguage } from '@/lib/editor/code-languages'

describe('resolveCodeLanguage', () => {
  it('returns null for auto / empty', () => {
    expect(resolveCodeLanguage(null)).toBeNull()
    expect(resolveCodeLanguage('auto')).toBeNull()
    expect(resolveCodeLanguage('')).toBeNull()
  })

  it('maps common aliases', () => {
    expect(resolveCodeLanguage('js')).toBe('javascript')
    expect(resolveCodeLanguage('ts')).toBe('typescript')
    expect(resolveCodeLanguage('py')).toBe('python')
    expect(resolveCodeLanguage('yml')).toBe('yaml')
    expect(resolveCodeLanguage('sh')).toBe('bash')
  })

  it('passes through known ids', () => {
    expect(resolveCodeLanguage('rust')).toBe('rust')
  })
})

describe('getCodeLanguageLabel', () => {
  it('returns Automaticky for empty language', () => {
    expect(getCodeLanguageLabel(null)).toBe('Automaticky')
  })

  it('returns configured labels and raw fallback', () => {
    expect(getCodeLanguageLabel('python')).toBe('Python')
    expect(getCodeLanguageLabel('obscure-lang')).toBe('obscure-lang')
  })
})
