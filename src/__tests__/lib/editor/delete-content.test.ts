import { describe, expect, it } from 'vitest'
import '@/i18n'
import { getHandleDeleteLabel } from '@/lib/editor/delete-content'

describe('getHandleDeleteLabel', () => {
  it('offers delete on list items, quotes, code, and rules', () => {
    expect(getHandleDeleteLabel('listItem')).toBeTruthy()
    expect(getHandleDeleteLabel('taskItem')).toBeTruthy()
    expect(getHandleDeleteLabel('blockquote')).toBeTruthy()
    expect(getHandleDeleteLabel('codeBlock')).toBeTruthy()
    expect(getHandleDeleteLabel('horizontalRule')).toBeTruthy()
  })

  it('keeps the caret clear for everyday paragraphs and media with their own toolbar', () => {
    expect(getHandleDeleteLabel('paragraph')).toBeNull()
    expect(getHandleDeleteLabel('heading')).toBeNull()
    expect(getHandleDeleteLabel('image')).toBeNull()
    expect(getHandleDeleteLabel('lottieAnimation')).toBeNull()
  })
})
