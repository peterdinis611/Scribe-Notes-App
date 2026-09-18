import i18n from '@/i18n'

export function defaultCommentAuthor(): string {
  return i18n.language.startsWith('en') ? 'Me' : 'Ja'
}

export function resolveCommentAuthor(value: string | null | undefined): string {
  return value?.trim() || defaultCommentAuthor()
}
