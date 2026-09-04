import { useEffect } from 'react'
import { runFolderReconcile } from '@/lib/disk-sync'
import { useAppDispatch, useAppSelector } from '@/store/hooks'

const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000

/** Reconcile the documents folder on focus and on a quiet interval when enabled. */
export function useFolderAutoSync() {
  const dispatch = useAppDispatch()
  const enabled = useAppSelector((state) => state.settings.folderAutoSyncEnabled)

  useEffect(() => {
    if (!enabled) return

    const run = () => {
      void runFolderReconcile(dispatch)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') run()
    }

    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', onVisibility)
    const intervalId = window.setInterval(run, AUTO_SYNC_INTERVAL_MS)

    return () => {
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(intervalId)
    }
  }, [dispatch, enabled])
}
