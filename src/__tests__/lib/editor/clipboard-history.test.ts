import { afterEach, describe, expect, it } from 'vitest'
import { kvRemove, resetKvStoreForTests } from '@/lib/storage/kv'
import {
  CLIPBOARD_HISTORY_KEY,
  CLIPBOARD_HISTORY_LIMIT,
  clearClipboardHistory,
  getClipboardHistory,
  previewClipboardText,
  rememberClipboardItem,
  resetClipboardHistoryForTests,
} from '@/lib/editor/clipboard-history'

describe('clipboard history', () => {
  afterEach(async () => {
    resetClipboardHistoryForTests()
    kvRemove(CLIPBOARD_HISTORY_KEY)
    await resetKvStoreForTests()
  })

  it('keeps the newest clip first and overwrites after 10', () => {
    for (let index = 1; index <= CLIPBOARD_HISTORY_LIMIT + 2; index += 1) {
      rememberClipboardItem({ text: `clip ${index}` })
    }

    const items = getClipboardHistory()
    expect(items).toHaveLength(CLIPBOARD_HISTORY_LIMIT)
    expect(items[0]?.text).toBe('clip 12')
    expect(items[9]?.text).toBe('clip 3')
    expect(items.some((item) => item.text === 'clip 1')).toBe(false)
  })

  it('moves a repeated copy to the top instead of duplicating it', () => {
    rememberClipboardItem({ text: 'alpha' })
    rememberClipboardItem({ text: 'beta' })
    rememberClipboardItem({ text: 'alpha' })

    const items = getClipboardHistory()
    expect(items.map((item) => item.text)).toEqual(['alpha', 'beta'])
  })

  it('ignores empty clips and can clear the stack', () => {
    rememberClipboardItem({ text: '   ' })
    rememberClipboardItem({ text: 'kept' })
    expect(getClipboardHistory()).toHaveLength(1)

    clearClipboardHistory()
    expect(getClipboardHistory()).toHaveLength(0)
  })

  it('reloads persisted clips after an in-memory reset', () => {
    rememberClipboardItem({ text: 'survives' })
    resetClipboardHistoryForTests()
    expect(getClipboardHistory()[0]?.text).toBe('survives')
  })

  it('compacts preview text', () => {
    expect(previewClipboardText('one\n\ntwo   three')).toBe('one two three')
    expect(previewClipboardText('abcdefghij', 6)).toBe('abcde…')
  })
})
