import { resolveCodeLanguage } from '@/lib/editor/code-languages'

/** Language id for react-syntax-highlighter (omit for auto / plaintext). */
export function highlighterLanguage(language?: string | null): string | undefined {
  const resolved = resolveCodeLanguage(language)
  if (!resolved || resolved === 'plaintext') return undefined
  return resolved
}

export function isDocumentDark(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}
