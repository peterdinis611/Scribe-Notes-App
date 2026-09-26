import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { applyFolderReconcileResult, runFolderReconcile } from '@/lib/disk-sync'
import { setDocumentsWatchEnabled, type ReconcileResult } from '@/lib/db/api'
import { isTauriRuntime } from '@/lib/tauri'
import { useAppDispatch, useAppSelector } from '@/store/hooks'

/**
 * Reconcile on focus as a fallback, and react to Rust FSEvents (`disk-changed`).
 * When folder auto-sync is on, the native watcher stays enabled.
 */
export function useFolderAutoSync() {
  const dispatch = useAppDispatch()
  const enabled = useAppSelector((state) => state.settings.folderAutoSyncEnabled)

  useEffect(() => {
    if (!isTauriRuntime()) return
    void setDocumentsWatchEnabled(enabled).catch(() => {})
  }, [enabled])

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

    let unlisten: (() => void) | undefined
    if (isTauriRuntime()) {
      void listen<ReconcileResult>('disk-changed', (event) => {
        void applyFolderReconcileResult(dispatch, event.payload)
      }).then((fn) => {
        unlisten = fn
      })
    }

    return () => {
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', onVisibility)
      unlisten?.()
    }
  }, [dispatch, enabled])
}
