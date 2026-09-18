import { describe, expect, it } from 'vitest'
import { kvRemove } from '@/lib/storage/kv'
import {
  clampSidebarWidth,
  persistSidebarWidth,
  readSidebarWidth,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_KEY,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
} from '@/lib/layout/sidebar-width'

describe('sidebar width', () => {
  it('clamps to the allowed range and leaves room for the editor', () => {
    expect(clampSidebarWidth(80, 1440)).toBe(SIDEBAR_WIDTH_MIN)
    expect(clampSidebarWidth(1200, 1440)).toBe(SIDEBAR_WIDTH_MAX)
    expect(clampSidebarWidth(500, 800)).toBe(800 - 52 - 420)
  })

  it('persists a clamped width', () => {
    kvRemove(SIDEBAR_WIDTH_KEY)
    expect(readSidebarWidth()).toBe(SIDEBAR_WIDTH_DEFAULT)
    persistSidebarWidth(480)
    expect(readSidebarWidth()).toBe(480)
    persistSidebarWidth(40)
    expect(readSidebarWidth()).toBe(SIDEBAR_WIDTH_MIN)
  })
})
