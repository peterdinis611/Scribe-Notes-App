import { describe, expect, it } from 'vitest'
import { parseCustomLocalePack, guessCodeFromFileName } from '@/lib/i18n/custom-locales'

describe('parseCustomLocalePack', () => {
  it('parses wrapped pack', () => {
    const pack = parseCustomLocalePack(
      JSON.stringify({
        code: 'de',
        name: 'Deutsch',
        messages: {
          settings: { language: { title: 'Sprache' } },
          common: { save: 'Speichern', cancel: 'Abbrechen' },
        },
      }),
    )
    expect(pack.code).toBe('de')
    expect(pack.name).toBe('Deutsch')
    expect(pack.messages.settings).toBeTruthy()
  })

  it('parses bare catalog with filename code', () => {
    const pack = parseCustomLocalePack(
      JSON.stringify({
        settings: { language: { title: 'Jazyk' } },
        common: { a: '1', b: '2', c: '3' },
      }),
      { fallbackCode: 'cs', fallbackName: 'Čeština' },
    )
    expect(pack.code).toBe('cs')
    expect(pack.name).toBe('Čeština')
  })

  it('rejects built-in codes', () => {
    expect(() =>
      parseCustomLocalePack(
        JSON.stringify({
          code: 'sk',
          name: 'Nope',
          messages: { a: '1', b: '2', c: '3' },
        }),
      ),
    ).toThrow(/built-in/i)
  })

  it('guesses code from file name', () => {
    expect(guessCodeFromFileName('scribe-de.json')).toBe('de')
    expect(guessCodeFromFileName('pl.json')).toBe('pl')
  })
})
