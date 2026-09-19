import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
  applySidebarWidthVar,
  clampSidebarWidth,
  persistSidebarWidth,
  readSidebarWidth,
  SIDEBAR_RAIL_WIDTH,
  SIDEBAR_WIDTH_DEFAULT,
} from '@/lib/layout/sidebar-width'

export function useResizableSidebar() {
  const [width, setWidth] = useState(readSidebarWidth)
  const [resizing, setResizing] = useState(false)
  const widthRef = useRef(width)
  widthRef.current = width

  useLayoutEffect(() => {
    applySidebarWidthVar(width)
  }, [width])

  const resetWidth = useCallback(() => {
    const next = clampSidebarWidth(SIDEBAR_WIDTH_DEFAULT)
    widthRef.current = next
    setWidth(next)
    persistSidebarWidth(next)
  }, [])

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      if (event.detail >= 2) {
        resetWidth()
        return
      }

      const startX = event.clientX
      const startWidth = widthRef.current
      setResizing(true)
      document.body.classList.add('is-sidebar-resizing')

      function onMove(move: PointerEvent) {
        const next = clampSidebarWidth(startWidth + (move.clientX - startX))
        widthRef.current = next
        setWidth(next)
      }

      let finished = false
      function onUp() {
        if (finished) return
        finished = true
        setResizing(false)
        document.body.classList.remove('is-sidebar-resizing')
        persistSidebarWidth(widthRef.current)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [resetWidth],
  )

  return {
    width,
    resizing,
    totalWidth: width + SIDEBAR_RAIL_WIDTH,
    onResizePointerDown,
    resetWidth,
  }
}
