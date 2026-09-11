import { describe, expect, it } from 'vitest'
import { toGlobalShortcutAccelerator } from '@/lib/global-shortcuts'

describe('toGlobalShortcutAccelerator', () => {
  it('maps Mod to CommandOrControl', () => {
    expect(toGlobalShortcutAccelerator('Mod+Shift+N')).toBe('CommandOrControl+Shift+N')
  })

  it('uppercases single-letter keys', () => {
    expect(toGlobalShortcutAccelerator('Mod+Shift+d')).toBe('CommandOrControl+Shift+D')
  })
})
