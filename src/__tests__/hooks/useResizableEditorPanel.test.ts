import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useResizableEditorPanel } from '@/hooks/useResizableEditorPanel'
import {
  clampEditorPanelWidth,
  EDITOR_PANEL_WIDTH_DEFAULT,
  EDITOR_PANEL_WIDTH_KEY,
  EDITOR_PANEL_WIDTH_MAX,
} from '@/lib/layout/editor-panel-width'
import { kvRemove } from '@/lib/storage/kv'

function pointerDown(detail: number) {
  return {
    button: 0,
    detail,
    clientX: 900,
    preventDefault() {},
    stopPropagation() {},
  } as unknown as React.PointerEvent<HTMLButtonElement>
}

afterEach(() => {
  kvRemove(EDITOR_PANEL_WIDTH_KEY)
  document.documentElement.style.removeProperty('--editor-panel-width')
})

describe('useResizableEditorPanel', () => {
  it('expands to the available width on the second pointer press', () => {
    const { result } = renderHook(() => useResizableEditorPanel())

    expect(result.current.width).toBe(EDITOR_PANEL_WIDTH_DEFAULT)

    act(() => {
      result.current.onResizePointerDown(pointerDown(2))
    })

    expect(result.current.width).toBe(clampEditorPanelWidth(EDITOR_PANEL_WIDTH_MAX))
  })
})
