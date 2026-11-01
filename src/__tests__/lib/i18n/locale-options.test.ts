import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE } from '@/i18n'
import { buildLocaleOptions } from '@/lib/i18n/locale-options'

describe('buildLocaleOptions', () => {
  it('puts Slovak default first, then other built-ins', () => {
    const options = buildLocaleOptions({
      labelFor: (key) => key,
      customLocales: [],
    })
    expect(options.map((item) => item.code)).toEqual(['sk', 'en', 'cs', 'hu', 'pl'])
    expect(options[0]?.code).toBe(DEFAULT_LOCALE)
    expect(options[0]?.isDefault).toBe(true)
    expect(options[1]?.code).toBe('en')
    expect(options[1]?.isDefault).toBeFalsy()
  })

  it('appends custom packs after built-ins', () => {
    const options = buildLocaleOptions({
      labelFor: (key) => key,
      customLocales: [
        { code: 'de', name: 'Deutsch' },
        { code: 'fr', name: 'Français' },
      ],
    })
    expect(options.map((item) => item.code)).toEqual(['sk', 'en', 'cs', 'hu', 'pl', 'de', 'fr'])
    expect(options[5]?.kind).toBe('custom')
    expect(options[5]?.short).toBe('DE')
    expect(options[5]?.label).toBe('Deutsch')
  })
})
