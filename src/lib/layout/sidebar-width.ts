import { kvGet, kvSet } from '@/lib/storage/kv'

export const SIDEBAR_WIDTH_KEY = 'scribe-sidebar-width'
export const SIDEBAR_WIDTH_DEFAULT = 300
export const SIDEBAR_WIDTH_MIN = 240
export const SIDEBAR_WIDTH_MAX = 640
export const SIDEBAR_RAIL_WIDTH = 52

export function clampSidebarWidth(value: number, viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth) {
  const room = Math.max(SIDEBAR_WIDTH_MIN, viewportWidth - SIDEBAR_RAIL_WIDTH - 420)
  const max = Math.min(SIDEBAR_WIDTH_MAX, room)
  if (!Number.isFinite(value)) return SIDEBAR_WIDTH_DEFAULT
  return Math.round(Math.min(max, Math.max(SIDEBAR_WIDTH_MIN, value)))
}

export function applySidebarWidthVar(width: number) {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--sidebar-width', `${width}px`)
}

export function readSidebarWidth(): number {
  try {
    const raw = kvGet(SIDEBAR_WIDTH_KEY)
    if (!raw) return SIDEBAR_WIDTH_DEFAULT
    return clampSidebarWidth(Number(raw))
  } catch {
    return SIDEBAR_WIDTH_DEFAULT
  }
}

export function persistSidebarWidth(width: number) {
  const next = clampSidebarWidth(width)
  kvSet(SIDEBAR_WIDTH_KEY, String(next))
  return next
}
