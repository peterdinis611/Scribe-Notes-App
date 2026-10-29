import { describe, expect, it } from 'vitest'
import {
  applyToastStack,
  DEFAULT_TOAST_SETTINGS,
  normalizeToastSettings,
  resolveToastDuration,
  shouldShowToastVariant,
} from '@/lib/toast/settings'

describe('toast settings (scribe-toast mirror)', () => {
  it('normalizes out-of-range values', () => {
    const s = normalizeToastSettings({
      durationMs: 10,
      durationWithActionMs: 20,
      exitMs: 9000,
      maxVisible: 99,
    })
    expect(s.durationMs).toBe(800)
    expect(s.durationWithActionMs).toBeGreaterThanOrEqual(s.durationMs)
    expect(s.exitMs).toBe(1000)
    expect(s.maxVisible).toBe(12)
  })

  it('resolves duration with action', () => {
    const s = DEFAULT_TOAST_SETTINGS
    expect(resolveToastDuration(s, false)).toBe(3500)
    expect(resolveToastDuration(s, true)).toBe(8000)
    expect(resolveToastDuration(s, false, 0)).toBe(0)
  })

  it('mutes variants when disabled', () => {
    const s = normalizeToastSettings({ showSuccess: false, enabled: true })
    expect(shouldShowToastVariant(s, 'success')).toBe(false)
    expect(shouldShowToastVariant(s, 'error')).toBe(true)
    expect(shouldShowToastVariant({ ...s, enabled: false }, 'error')).toBe(false)
  })

  it('drop-oldest trims the stack', () => {
    const settings = normalizeToastSettings({ maxVisible: 2, stackBehavior: 'drop-oldest' })
    const stack = applyToastStack(
      [
        { id: '1', title: 'a', variant: 'info' },
        { id: '2', title: 'b', variant: 'info' },
      ],
      { id: '3', title: 'c', variant: 'info' },
      settings,
    )
    expect(stack.map((t) => t.id)).toEqual(['2', '3'])
  })
})
