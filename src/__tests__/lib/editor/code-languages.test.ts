import { describe, expect, it } from 'vitest'
import {
  CODE_LANGUAGES,
  filterCodeLanguages,
  getCodeLanguageLabel,
  resolveCodeLanguage,
} from '@/lib/editor/code-languages'

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
    expect(resolveCodeLanguage('html')).toBe('xml')
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

describe('CODE_LANGUAGES', () => {
  it('includes auto plus the full highlight.js set', () => {
    expect(CODE_LANGUAGES[0]?.id).toBe('auto')
    expect(CODE_LANGUAGES.length).toBeGreaterThan(180)
    expect(CODE_LANGUAGES.some((item) => item.id === 'rust')).toBe(true)
    expect(CODE_LANGUAGES.some((item) => item.id === 'nim')).toBe(true)
  })

  it('filters by query', () => {
    const rust = filterCodeLanguages('rust')
    expect(rust.some((item) => item.id === 'rust')).toBe(true)
    expect(filterCodeLanguages('zzzz-missing')).toEqual([])
  })
})
