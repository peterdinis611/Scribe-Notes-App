import { useTranslation } from 'react-i18next'
import { PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { SIDEBAR_DRAWER_BREAKPOINT } from '@/hooks/useLayoutTier'
import { useAppDispatch } from '@/store/hooks'
import { setSidebarOpen } from '@/store/documentsSlice'

export function SidebarToggle() {
  const { t } = useTranslation()
  const isCompact = useMediaQuery(`(max-width: ${SIDEBAR_DRAWER_BREAKPOINT}px)`)
  const dispatch = useAppDispatch()

  if (!isCompact) return null

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => dispatch(setSidebarOpen(true))}
      title={t('nav.library')}
      aria-label={t('nav.openLibrary')}
    >
      <PanelLeft className="h-4 w-4" />
    </Button>
  )
}
