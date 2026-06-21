import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  basename,
  countWords,
  debounce,
  extractTitleFromContent,
  formatRelativeTime,
  throttle,
} from '@/lib/utils'

describe('extractTitleFromContent', () => {
  it('uses first heading text', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Môj nadpis' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Ignored' }] },
      ],
    })
    expect(extractTitleFromContent(json)).toBe('Môj nadpis')
  })

  it('falls back to first paragraph', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Úvodný text' }] }],
    })
    expect(extractTitleFromContent(json)).toBe('Úvodný text')
  })

  it('returns default title for invalid json', () => {
    expect(extractTitleFromContent('not-json')).toBe('Bez názvu')
  })
})

describe('countWords', () => {
  it('counts words across nested nodes', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Jeden dva' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'tri' }] }],
            },
          ],
        },
      ],
    })
    expect(countWords(json)).toBe(3)
  })
})

describe('basename', () => {
  it('returns last path segment', () => {
    expect(basename('/Users/test/Dokumenty/report.scribe')).toBe('report.scribe')
    expect(basename('C:\\docs\\file.scribe')).toBe('file.scribe')
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-21T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats recent timestamps in slovak', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatRelativeTime(now - 30)).toBe('Práve teraz')
    expect(formatRelativeTime(now - 120)).toBe('Pred 2 min')
    expect(formatRelativeTime(now - 7200)).toBe('Pred 2 h')
    expect(formatRelativeTime(now - 172800)).toBe('Pred 2 d')
  })
})

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('delays execution until quiet period', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced('a')
    debounced('b')
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith('b')
  })
})

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('limits calls to once per interval', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled()
    throttled()
    expect(fn).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(100)
    throttled()
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
