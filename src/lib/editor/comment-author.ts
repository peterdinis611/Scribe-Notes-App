import i18n from '@/i18n'
import { defaultCommentAuthorFor } from '@/lib/i18n/locale-tags'

export function defaultCommentAuthor(): string {
  return defaultCommentAuthorFor(i18n.language)
}

export function resolveCommentAuthor(value: string | null | undefined): string {
  return value?.trim() || defaultCommentAuthor()
}
