import { describe, expect, it } from 'vitest'
import { kvRemove } from '@/lib/storage/kv'
import { SIDEBAR_WIDTH_KEY } from '@/lib/layout/sidebar-width'
import {
  clampEditorPanelWidth,
  clampTocRailWidth,
  EDITOR_PANEL_WIDTH_DEFAULT,
  EDITOR_PANEL_WIDTH_KEY,
  EDITOR_PANEL_WIDTH_MAX,
  EDITOR_PANEL_WIDTH_MIN,
  nextEditorPanelWidthOnDoubleClick,
  persistEditorPanelWidth,
  persistTocRailWidth,
  readEditorPanelWidth,
  readTocRailWidth,
  TOC_RAIL_WIDTH_DEFAULT,
  TOC_RAIL_WIDTH_KEY,
  TOC_RAIL_WIDTH_MAX,
  TOC_RAIL_WIDTH_MIN,
} from '@/lib/layout/editor-panel-width'

describe('editor panel width', () => {
  it('clamps to the allowed range and leaves room for the canvas', () => {
    expect(clampEditorPanelWidth(80, 1440)).toBe(EDITOR_PANEL_WIDTH_MIN)
    expect(clampEditorPanelWidth(1200, 2400)).toBe(EDITOR_PANEL_WIDTH_MAX)
    expect(clampEditorPanelWidth(500, 900)).toBe(900 - 52 - 380)
  })

  it('honors a higher temporary minimum for compare mode', () => {
    expect(clampEditorPanelWidth(320, 2400, 560)).toBe(560)
    expect(clampEditorPanelWidth(700, 2400, 560)).toBe(700)
  })

  it('persists a clamped width', () => {
    kvRemove(EDITOR_PANEL_WIDTH_KEY)
    expect(readEditorPanelWidth()).toBe(EDITOR_PANEL_WIDTH_DEFAULT)
    persistEditorPanelWidth(480)
    expect(readEditorPanelWidth()).toBe(480)
    persistEditorPanelWidth(40)
    expect(readEditorPanelWidth()).toBe(EDITOR_PANEL_WIDTH_MIN)
  })

  it('double-click expands to the available max, then back to default', () => {
    kvRemove(SIDEBAR_WIDTH_KEY)
    const viewport = 1440
    const max = clampEditorPanelWidth(EDITOR_PANEL_WIDTH_MAX, viewport)
    const def = clampEditorPanelWidth(EDITOR_PANEL_WIDTH_DEFAULT, viewport)
    expect(nextEditorPanelWidthOnDoubleClick(def, viewport)).toBe(max)
    expect(nextEditorPanelWidthOnDoubleClick(max, viewport)).toBe(def)
    expect(nextEditorPanelWidthOnDoubleClick(280, viewport)).toBe(max)
  })
})

describe('toc rail width', () => {
  it('clamps to the allowed range', () => {
    expect(clampTocRailWidth(40, 1440)).toBe(TOC_RAIL_WIDTH_MIN)
    expect(clampTocRailWidth(800, 1440)).toBe(TOC_RAIL_WIDTH_MAX)
  })

  it('persists a clamped width', () => {
    kvRemove(TOC_RAIL_WIDTH_KEY)
    expect(readTocRailWidth()).toBe(TOC_RAIL_WIDTH_DEFAULT)
    persistTocRailWidth(280)
    expect(readTocRailWidth()).toBe(280)
  })
})
