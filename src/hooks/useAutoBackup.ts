import { useEffect, useRef } from 'react'
import { exportLibraryArchiveToDir } from '@/lib/db/api'
import { isTauriRuntime } from '@/lib/tauri'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLastAutoBackupAt } from '@/store/settingsSlice'

const CHECK_EVERY_MS = 60 * 60 * 1000 // hourly

export function isBackupDue(lastAt: number | null, intervalDays: number): boolean {
  if (!lastAt) return true
  const elapsed = Date.now() - lastAt
  return elapsed >= intervalDays * 24 * 60 * 60 * 1000
}

/**
 * Quiet scheduled library backups.
 * Uses the chosen folder when set; otherwise ~/Documents/Scribe/Backups.
 */
export function useAutoBackup() {
  const dispatch = useAppDispatch()
  const enabled = useAppSelector((state) => state.settings.autoBackupEnabled)
  const intervalDays = useAppSelector((state) => state.settings.autoBackupIntervalDays)
  const directory = useAppSelector((state) => state.settings.autoBackupDirectory)
  const lastAt = useAppSelector((state) => state.settings.lastAutoBackupAt)
  const running = useRef(false)

  useEffect(() => {
    if (!enabled || !isTauriRuntime()) return

    async function maybeBackup() {
      if (running.current) return
      if (!isBackupDue(lastAt, intervalDays)) return

      running.current = true
      try {
        // Empty string → Rust resolves to Documents/Scribe/Backups
        await exportLibraryArchiveToDir(directory ?? '')
        dispatch(setLastAutoBackupAt(Date.now()))
      } catch (error) {
        console.warn('[scribe] auto-backup failed', error)
      } finally {
        running.current = false
      }
    }

    void maybeBackup()
    const timer = window.setInterval(() => void maybeBackup(), CHECK_EVERY_MS)

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void maybeBackup()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [directory, dispatch, enabled, intervalDays, lastAt])
}
