import type { BuiltInLocale } from '@/i18n'
import { BUILT_IN_LOCALES, DEFAULT_LOCALE } from '@/i18n'

export type LocaleOption = {
  code: string
  label: string
  short: string
  kind: 'builtin' | 'custom'
  isDefault?: boolean
}

const BUILT_IN: { id: BuiltInLocale; labelKey: string; short: string }[] = [
  { id: 'sk', labelKey: 'settings.language.sk', short: 'SK' },
  { id: 'en', labelKey: 'settings.language.en', short: 'EN' },
]

/** Pure locale dropdown options — SK (default) first, then EN, then custom packs. */
export function buildLocaleOptions(input: {
  labelFor: (key: string) => string
  customLocales: Array<{ code: string; name: string }>
}): LocaleOption[] {
  const builtIn: LocaleOption[] = BUILT_IN.map((entry) => ({
    code: entry.id,
    label: input.labelFor(entry.labelKey),
    short: entry.short,
    kind: 'builtin' as const,
    isDefault: entry.id === DEFAULT_LOCALE,
  }))

  builtIn.sort((a, b) => {
    if (a.code === DEFAULT_LOCALE) return -1
    if (b.code === DEFAULT_LOCALE) return 1
    return (
      BUILT_IN_LOCALES.indexOf(a.code as BuiltInLocale) -
      BUILT_IN_LOCALES.indexOf(b.code as BuiltInLocale)
    )
  })

  const customs: LocaleOption[] = input.customLocales.map((pack) => ({
    code: pack.code,
    label: pack.name,
    short: pack.code.slice(0, 3).toUpperCase(),
    kind: 'custom' as const,
  }))

  return [...builtIn, ...customs]
}
