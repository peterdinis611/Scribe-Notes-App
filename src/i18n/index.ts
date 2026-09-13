import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/i18n/locales/en.json'
import sk from '@/i18n/locales/sk.json'
import { isBuiltInLocaleCode } from '@/lib/i18n/custom-locales'
import type { CustomLocalePack } from '@/lib/i18n/custom-locales'
import { readCustomLocales, readLocale } from '@/store/persistence'

export const BUILT_IN_LOCALES = ['sk', 'en'] as const
export type BuiltInLocale = (typeof BUILT_IN_LOCALES)[number]
/** Built-in or imported custom language code. */
export type AppLocale = string

/** @deprecated Prefer BUILT_IN_LOCALES — kept for older imports. */
export const SUPPORTED_LOCALES = BUILT_IN_LOCALES

export const DEFAULT_LOCALE: BuiltInLocale = 'sk'

export function registerCustomLocaleBundle(pack: CustomLocalePack) {
  if (isBuiltInLocaleCode(pack.code)) return
  i18n.addResourceBundle(pack.code, 'translation', pack.messages, true, true)
}

export function unregisterCustomLocaleBundle(code: string) {
  if (isBuiltInLocaleCode(code)) return
  if (i18n.hasResourceBundle(code, 'translation')) {
    i18n.removeResourceBundle(code, 'translation')
  }
}

function registerStoredCustomLocales() {
  for (const pack of readCustomLocales()) {
    registerCustomLocaleBundle(pack)
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    sk: { translation: sk },
    en: { translation: en },
  },
  lng: readLocale(),
  fallbackLng: DEFAULT_LOCALE,
  interpolation: {
    escapeValue: false,
  },
})

registerStoredCustomLocales()

export default i18n
