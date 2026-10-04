import i18n from '@/i18n'
import type { PluginI18nApi, PluginI18nTable, PluginManifest } from '@/lib/plugins/types'

export function createPluginI18n(manifest: PluginManifest): PluginI18nApi {
  const table: PluginI18nTable = manifest.i18n ?? {}

  return {
    locale() {
      return i18n.language?.slice(0, 2) || 'en'
    },
    t(key: string, fallback?: string) {
      const locale = this.locale()
      const fromLocale = table[locale]?.[key]
      if (fromLocale) return fromLocale
      const fromEn = table.en?.[key]
      if (fromEn) return fromEn
      if (fallback) return fallback
      return key
    },
  }
}

/** Resolve manifest name/description with i18n overrides when present. */
export function localizeManifestField(
  manifest: PluginManifest,
  field: 'name' | 'description',
): string {
  const api = createPluginI18n(manifest)
  const key = field === 'name' ? 'manifest.name' : 'manifest.description'
  const translated = api.t(key, '')
  if (translated && translated !== key) return translated
  return field === 'name' ? manifest.name : (manifest.description ?? '')
}
