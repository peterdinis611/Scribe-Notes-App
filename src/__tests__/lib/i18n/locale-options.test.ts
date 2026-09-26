import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE } from '@/i18n'
import { buildLocaleOptions } from '@/lib/i18n/locale-options'

describe('buildLocaleOptions', () => {
  it('puts Slovak default first, then English', () => {
    const options = buildLocaleOptions({
      labelFor: (key) => key,
      customLocales: [],
    })
    expect(options).toHaveLength(2)
    expect(options[0]?.code).toBe(DEFAULT_LOCALE)
    expect(options[0]?.isDefault).toBe(true)
    expect(options[1]?.code).toBe('en')
    expect(options[1]?.isDefault).toBeFalsy()
  })

  it('appends custom packs after built-ins', () => {
    const options = buildLocaleOptions({
      labelFor: (key) => (key.endsWith('.sk') ? 'Slovenčina' : 'English'),
      customLocales: [
        { code: 'cs', name: 'Čeština' },
        { code: 'de', name: 'Deutsch' },
      ],
    })
    expect(options.map((item) => item.code)).toEqual(['sk', 'en', 'cs', 'de'])
    expect(options[2]?.kind).toBe('custom')
    expect(options[2]?.short).toBe('CS')
    expect(options[2]?.label).toBe('Čeština')
  })
})
