/** BCP-47 / speech / display helpers for built-in UI languages. */

export const BUILT_IN_LANG_CODES = ['sk', 'en', 'cs', 'hu', 'pl'] as const
export type BuiltInLangCode = (typeof BUILT_IN_LANG_CODES)[number]

const BCP47: Record<BuiltInLangCode, string> = {
  sk: 'sk-SK',
  en: 'en-US',
  cs: 'cs-CZ',
  hu: 'hu-HU',
  pl: 'pl-PL',
}

/** Web Speech API / recognition `lang` tags. */
const SPEECH: Record<BuiltInLangCode, string> = {
  sk: 'sk-SK',
  en: 'en-US',
  cs: 'cs-CZ',
  hu: 'hu-HU',
  pl: 'pl-PL',
}

/** HTML `lang` / spellcheck hint (primary subtag). */
const HTML_LANG: Record<BuiltInLangCode, string> = {
  sk: 'sk',
  en: 'en',
  cs: 'cs',
  hu: 'hu',
  pl: 'pl',
}

const COMMENT_AUTHOR: Record<BuiltInLangCode, string> = {
  sk: 'Ja',
  en: 'Me',
  cs: 'Já',
  hu: 'Én',
  pl: 'Ja',
}

const ANSWER_LANGUAGE_HINT: Record<BuiltInLangCode, string> = {
  sk: 'Always answer in Slovak.',
  en: 'Always answer in English.',
  cs: 'Always answer in Czech.',
  hu: 'Always answer in Hungarian.',
  pl: 'Always answer in Polish.',
}

export function primaryLangCode(raw?: string | null): string {
  const base = (raw || '').trim().toLowerCase().replace('_', '-').split('-')[0] ?? ''
  return base
}

export function asBuiltInLang(raw?: string | null): BuiltInLangCode | null {
  const code = primaryLangCode(raw)
  return (BUILT_IN_LANG_CODES as readonly string[]).includes(code)
    ? (code as BuiltInLangCode)
    : null
}

export function bcp47Tag(raw?: string | null, fallback: string = 'en-US'): string {
  const builtIn = asBuiltInLang(raw)
  return builtIn ? BCP47[builtIn] : fallback
}

export function speechRecognitionLang(raw?: string | null, fallback: string = 'en-US'): string {
  const builtIn = asBuiltInLang(raw)
  return builtIn ? SPEECH[builtIn] : fallback
}

export function htmlLang(raw?: string | null, fallback: string = 'en'): string {
  const builtIn = asBuiltInLang(raw)
  return builtIn ? HTML_LANG[builtIn] : fallback
}

export function defaultCommentAuthorFor(raw?: string | null): string {
  return COMMENT_AUTHOR[asBuiltInLang(raw) ?? 'en']
}

export function agentAnswerLanguageHint(code: BuiltInLangCode): string {
  return ANSWER_LANGUAGE_HINT[code]
}

/** i18n key under `settings.language.*` for a built-in code, else null. */
export function builtInLanguageLabelKey(code: string): string | null {
  return asBuiltInLang(code) ? `settings.language.${code}` : null
}
