import { SIDEBAR_RAIL_WIDTH, readSidebarWidth } from '@/lib/layout/sidebar-width'
import { kvGet, kvSet } from '@/lib/storage/kv'

// Keep in sync with Tailwind `xl` / SIDEBAR_DRAWER_BREAKPOINT — library is overlay below this.
const LIBRARY_IN_FLOW_MIN_WIDTH = 1280

export const EDITOR_PANEL_WIDTH_KEY = 'scribe-editor-panel-width'
export const EDITOR_PANEL_WIDTH_DEFAULT = 320
export const EDITOR_PANEL_WIDTH_MIN = 240
export const EDITOR_PANEL_WIDTH_MAX = 720
export const EDITOR_PANEL_RAIL_WIDTH = 52
export const EDITOR_CONTENT_MIN = 380

export const TOC_RAIL_WIDTH_KEY = 'scribe-toc-rail-width'
export const TOC_RAIL_WIDTH_DEFAULT = 200
export const TOC_RAIL_WIDTH_MIN = 160
export const TOC_RAIL_WIDTH_MAX = 360

function occupiedLibraryWidth(viewportWidth: number) {
  if (viewportWidth < LIBRARY_IN_FLOW_MIN_WIDTH) return 0
  return SIDEBAR_RAIL_WIDTH + readSidebarWidth()
}

export function clampEditorPanelWidth(
  value: number,
  viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth,
  minWidth = EDITOR_PANEL_WIDTH_MIN,
) {
  const occupiedLeft = occupiedLibraryWidth(viewportWidth)
  const room = Math.max(
    minWidth,
    viewportWidth - EDITOR_PANEL_RAIL_WIDTH - occupiedLeft - EDITOR_CONTENT_MIN,
  )
  const max = Math.min(EDITOR_PANEL_WIDTH_MAX, room)
  const min = Math.min(minWidth, max)
  if (!Number.isFinite(value)) return Math.min(max, Math.max(min, EDITOR_PANEL_WIDTH_DEFAULT))
  return Math.round(Math.min(max, Math.max(min, value)))
}

export function applyEditorPanelWidthVar(width: number) {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--editor-panel-width', `${width}px`)
}

export function readEditorPanelWidth(minWidth = EDITOR_PANEL_WIDTH_MIN): number {
  try {
    const raw = kvGet(EDITOR_PANEL_WIDTH_KEY)
    if (!raw) return clampEditorPanelWidth(EDITOR_PANEL_WIDTH_DEFAULT, undefined, minWidth)
    return clampEditorPanelWidth(Number(raw), undefined, minWidth)
  } catch {
    return clampEditorPanelWidth(EDITOR_PANEL_WIDTH_DEFAULT, undefined, minWidth)
  }
}

export function persistEditorPanelWidth(width: number, minWidth = EDITOR_PANEL_WIDTH_MIN) {
  const next = clampEditorPanelWidth(width, undefined, minWidth)
  kvSet(EDITOR_PANEL_WIDTH_KEY, String(next))
  return next
}

export function clampTocRailWidth(
  value: number,
  viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth,
) {
  const room = Math.max(TOC_RAIL_WIDTH_MIN, viewportWidth - EDITOR_PANEL_RAIL_WIDTH - occupiedLibraryWidth(viewportWidth) - EDITOR_CONTENT_MIN)
  const max = Math.min(TOC_RAIL_WIDTH_MAX, room)
  if (!Number.isFinite(value)) return TOC_RAIL_WIDTH_DEFAULT
  return Math.round(Math.min(max, Math.max(TOC_RAIL_WIDTH_MIN, value)))
}

export function applyTocRailWidthVar(width: number) {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--editor-toc-width', `${width}px`)
}

export function readTocRailWidth(): number {
  try {
    const raw = kvGet(TOC_RAIL_WIDTH_KEY)
    if (!raw) return TOC_RAIL_WIDTH_DEFAULT
    return clampTocRailWidth(Number(raw))
  } catch {
    return TOC_RAIL_WIDTH_DEFAULT
  }
}

export function persistTocRailWidth(width: number) {
  const next = clampTocRailWidth(width)
  kvSet(TOC_RAIL_WIDTH_KEY, String(next))
  return next
}
