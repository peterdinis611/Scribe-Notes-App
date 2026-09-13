import { useEffect, useRef } from 'react'
import { exportLibraryArchiveToDir } from '@/lib/db/api'
import { isTauriRuntime } from '@/lib/tauri'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLastAutoBackupAt } from '@/store/settingsSlice'
import { clampAutoBackupIntervalHours } from '@/store/persistence'

const MS_PER_HOUR = 60 * 60 * 1000
const MIN_CHECK_MS = 5 * 60 * 1000 // 5 minutes
const MAX_CHECK_MS = 60 * 60 * 1000 // 1 hour

export function isBackupDue(lastAt: number | null, intervalHours: number): boolean {
  if (!lastAt) return true
  const hours = clampAutoBackupIntervalHours(intervalHours)
  const elapsed = Date.now() - lastAt
  return elapsed >= hours * MS_PER_HOUR
}

export function nextBackupAt(lastAt: number | null, intervalHours: number): number {
  const hours = clampAutoBackupIntervalHours(intervalHours)
  if (!lastAt) return Date.now()
  return lastAt + hours * MS_PER_HOUR
}

/** How often to poll; denser for short intervals. */
export function backupCheckIntervalMs(intervalHours: number): number {
  const hours = clampAutoBackupIntervalHours(intervalHours)
  if (hours <= 1) return MIN_CHECK_MS
  if (hours <= 6) return 15 * 60 * 1000
  return MAX_CHECK_MS
}

/**
 * Quiet scheduled library backups.
 * Uses the chosen folder when set; otherwise ~/Documents/Scribe/Backups.
 */
export function useAutoBackup() {
  const dispatch = useAppDispatch()
  const enabled = useAppSelector((state) => state.settings.autoBackupEnabled)
  const intervalHours = useAppSelector((state) => state.settings.autoBackupIntervalHours)
  const directory = useAppSelector((state) => state.settings.autoBackupDirectory)
  const lastAt = useAppSelector((state) => state.settings.lastAutoBackupAt)
  const running = useRef(false)

  useEffect(() => {
    if (!enabled || !isTauriRuntime()) return

    async function maybeBackup() {
      if (running.current) return
      if (!isBackupDue(lastAt, intervalHours)) return

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
    const timer = window.setInterval(
      () => void maybeBackup(),
      backupCheckIntervalMs(intervalHours),
    )

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
  }, [directory, dispatch, enabled, intervalHours, lastAt])
}
