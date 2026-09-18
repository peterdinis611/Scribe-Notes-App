import { describe, expect, it } from 'vitest'
import { defaultCommentAuthor, resolveCommentAuthor } from '@/lib/editor/comment-author'
import i18n from '@/i18n'

describe('comment author', () => {
  it('falls back to a locale label when the name is blank', () => {
    expect(resolveCommentAuthor('')).toBe(defaultCommentAuthor())
    expect(resolveCommentAuthor('   ')).toBe(defaultCommentAuthor())
    expect(resolveCommentAuthor(null)).toBe(defaultCommentAuthor())
  })

  it('keeps a typed display name', () => {
    expect(resolveCommentAuthor('  Peter  ')).toBe('Peter')
  })

  it('uses Me in English and Ja otherwise', async () => {
    const previous = i18n.language
    await i18n.changeLanguage('en')
    expect(defaultCommentAuthor()).toBe('Me')
    await i18n.changeLanguage('sk')
    expect(defaultCommentAuthor()).toBe('Ja')
    await i18n.changeLanguage(previous)
  })
})
