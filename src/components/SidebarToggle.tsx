import { useSetAtom } from 'jotai'
import { PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { SIDEBAR_DRAWER_BREAKPOINT } from '@/hooks/useLayoutTier'
import { sidebarOpenAtom } from '@/store/documents'

export function SidebarToggle() {
  const isCompact = useMediaQuery(`(max-width: ${SIDEBAR_DRAWER_BREAKPOINT}px)`)
  const setSidebarOpen = useSetAtom(sidebarOpenAtom)

  if (!isCompact) return null

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setSidebarOpen(true)}
      title="Knižnica"
      aria-label="Otvoriť knižnicu"
    >
      <PanelLeft className="h-4 w-4" />
    </Button>
  )
}
