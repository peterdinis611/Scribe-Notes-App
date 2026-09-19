/** Article ids for Settings → Privacy and the repo policy files. */
export const PRIVACY_ARTICLE_IDS = [
  'localFirst',
  'storedData',
  'noCollection',
  'optionalNetwork',
  'mcp',
  'capture',
  'yourControl',
  'children',
  'changes',
  'contact',
] as const

export type PrivacyArticleId = (typeof PRIVACY_ARTICLE_IDS)[number]

export const PRIVACY_EFFECTIVE_DATE = '2026-09-19'
