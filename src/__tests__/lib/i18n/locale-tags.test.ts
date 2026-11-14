import { describe, expect, it } from 'vitest'
import {
  agentAnswerLanguageHint,
  asBuiltInLang,
  bcp47Tag,
  defaultCommentAuthorFor,
  htmlLang,
  speechRecognitionLang,
} from '@/lib/i18n/locale-tags'

describe('locale-tags', () => {
  it('maps built-in codes to BCP-47 and speech tags', () => {
    expect(bcp47Tag('cs')).toBe('cs-CZ')
    expect(bcp47Tag('hu-HU')).toBe('hu-HU')
    expect(speechRecognitionLang('pl')).toBe('pl-PL')
    expect(htmlLang('sk-SK')).toBe('sk')
    expect(asBuiltInLang('de')).toBeNull()
    expect(bcp47Tag('de', 'en-US')).toBe('en-US')
  })

  it('returns localized default comment authors', () => {
    expect(defaultCommentAuthorFor('en')).toBe('Me')
    expect(defaultCommentAuthorFor('sk')).toBe('Ja')
    expect(defaultCommentAuthorFor('cs')).toBe('Já')
    expect(defaultCommentAuthorFor('hu')).toBe('Én')
    expect(defaultCommentAuthorFor('pl')).toBe('Ja')
  })

  it('builds agent answer language hints', () => {
    expect(agentAnswerLanguageHint('cs')).toContain('Czech')
    expect(agentAnswerLanguageHint('hu')).toContain('Hungarian')
    expect(agentAnswerLanguageHint('pl')).toContain('Polish')
  })
})
