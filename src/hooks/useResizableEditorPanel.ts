import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
  applyEditorPanelWidthVar,
  clampEditorPanelWidth,
  nextEditorPanelWidthOnDoubleClick,
  persistEditorPanelWidth,
  readEditorPanelWidth,
} from '@/lib/layout/editor-panel-width'

export function useResizableEditorPanel(minWidth?: number) {
  const floor = minWidth ?? 0
  const [width, setWidth] = useState(() => readEditorPanelWidth(floor || undefined))
  const [resizing, setResizing] = useState(false)
  const widthRef = useRef(width)
  widthRef.current = width

  useLayoutEffect(() => {
    const next = readEditorPanelWidth(floor || undefined)
    widthRef.current = next
    setWidth(next)
  }, [floor])

  useLayoutEffect(() => {
    applyEditorPanelWidthVar(width)
  }, [width])

  const resetWidth = useCallback(() => {
    const next = nextEditorPanelWidthOnDoubleClick(widthRef.current, undefined, floor || undefined)
    widthRef.current = next
    setWidth(next)
    persistEditorPanelWidth(next, floor || undefined)
  }, [floor])

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      // preventDefault on pointerdown swallows dblclick — cycle width on the second press.
      if (event.detail >= 2) {
        resetWidth()
        return
      }

      const startX = event.clientX
      const startWidth = widthRef.current
      setResizing(true)
      document.body.classList.add('is-editor-panel-resizing')

      let moved = false
      function onMove(move: PointerEvent) {
        moved = true
        const next = clampEditorPanelWidth(startWidth - (move.clientX - startX), undefined, floor || undefined)
        widthRef.current = next
        setWidth(next)
      }

      let finished = false
      function onUp() {
        if (finished) return
        finished = true
        setResizing(false)
        document.body.classList.remove('is-editor-panel-resizing')
        if (moved) persistEditorPanelWidth(widthRef.current, floor || undefined)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [floor, resetWidth],
  )

  return {
    width,
    resizing,
    onResizePointerDown,
    resetWidth,
  }
}
