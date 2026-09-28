import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { StorageModeView } from '@/components/storage/StorageModeView'
import { ROUTES } from '@/lib/routes'
import { useAppSelector } from '@/store/hooks'

export function StorageModePage() {
  const enabled = useAppSelector((state) => state.settings.storageModeEnabled)
  const navigate = useNavigate()

  useEffect(() => {
    if (!enabled) {
      void navigate(ROUTES.settingsSection('storage'))
    }
  }, [enabled, navigate])

  if (!enabled) return null
  return <StorageModeView />
}
