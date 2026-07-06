import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { SIDEBAR_DRAWER_BREAKPOINT } from '@/hooks/useLayoutTier'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setSidebarOpen } from '@/store/documentsSlice'

export function useResponsiveSidebar() {
  const isCompact = useMediaQuery(`(max-width: ${SIDEBAR_DRAWER_BREAKPOINT}px)`)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const sidebarOpen = useAppSelector((state) => state.documents.sidebarOpen)
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (isCompact) {
      dispatch(setSidebarOpen(false))
      return
    }
    dispatch(setSidebarOpen(true))
  }, [dispatch, isCompact, pathname])

  return {
    isCompact,
    sidebarOpen,
    setSidebarOpen: (open: boolean) => dispatch(setSidebarOpen(open)),
  }
}
