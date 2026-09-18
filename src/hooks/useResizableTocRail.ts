import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
  applyTocRailWidthVar,
  clampTocRailWidth,
  persistTocRailWidth,
  readTocRailWidth,
  TOC_RAIL_WIDTH_DEFAULT,
} from '@/lib/layout/editor-panel-width'

export function useResizableTocRail() {
  const [width, setWidth] = useState(readTocRailWidth)
  const [resizing, setResizing] = useState(false)
  const widthRef = useRef(width)
  widthRef.current = width

  useLayoutEffect(() => {
    applyTocRailWidthVar(width)
  }, [width])

  const onResizePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = widthRef.current
    setResizing(true)
    document.body.classList.add('is-editor-panel-resizing')

    function onMove(move: PointerEvent) {
      const next = clampTocRailWidth(startWidth + (move.clientX - startX))
      widthRef.current = next
      setWidth(next)
    }

    let finished = false
    function onUp() {
      if (finished) return
      finished = true
      setResizing(false)
      document.body.classList.remove('is-editor-panel-resizing')
      persistTocRailWidth(widthRef.current)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [])

  const resetWidth = useCallback(() => {
    const next = clampTocRailWidth(TOC_RAIL_WIDTH_DEFAULT)
    widthRef.current = next
    setWidth(next)
    persistTocRailWidth(next)
  }, [])

  return {
    width,
    resizing,
    onResizePointerDown,
    resetWidth,
  }
}
