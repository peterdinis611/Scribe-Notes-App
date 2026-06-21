import { useEffect } from 'react'
import { useAtom } from 'jotai'
import { useRouterState } from '@tanstack/react-router'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { SIDEBAR_DRAWER_BREAKPOINT } from '@/hooks/useLayoutTier'
import { sidebarOpenAtom } from '@/store/documents'

export function useResponsiveSidebar() {
  const isCompact = useMediaQuery(`(max-width: ${SIDEBAR_DRAWER_BREAKPOINT}px)`)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom)

  useEffect(() => {
    if (isCompact) {
      setSidebarOpen(false)
      return
    }
    setSidebarOpen(true)
  }, [isCompact, pathname, setSidebarOpen])

  return {
    isCompact,
    sidebarOpen,
    setSidebarOpen,
  }
}
