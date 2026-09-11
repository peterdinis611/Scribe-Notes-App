import { useEffect, useRef } from 'react'
import { exportLibraryArchiveToDir } from '@/lib/db/api'
import { isTauriRuntime } from '@/lib/tauri'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLastAutoBackupAt } from '@/store/settingsSlice'

const CHECK_EVERY_MS = 60 * 60 * 1000 // hourly

function isBackupDue(lastAt: number | null, intervalDays: number): boolean {
  if (!lastAt) return true
  const elapsed = Date.now() - lastAt
  return elapsed >= intervalDays * 24 * 60 * 60 * 1000
}

/** Quiet scheduled library backups to a user-chosen folder. */
export function useAutoBackup() {
  const dispatch = useAppDispatch()
  const enabled = useAppSelector((state) => state.settings.autoBackupEnabled)
  const intervalDays = useAppSelector((state) => state.settings.autoBackupIntervalDays)
  const directory = useAppSelector((state) => state.settings.autoBackupDirectory)
  const lastAt = useAppSelector((state) => state.settings.lastAutoBackupAt)
  const running = useRef(false)

  useEffect(() => {
    if (!enabled || !directory || !isTauriRuntime()) return

    async function maybeBackup() {
      if (running.current) return
      if (!isBackupDue(lastAt, intervalDays)) return
      if (!directory) return

      running.current = true
      try {
        await exportLibraryArchiveToDir(directory)
        dispatch(setLastAutoBackupAt(Date.now()))
      } catch (error) {
        console.warn('[scribe] auto-backup failed', error)
      } finally {
        running.current = false
      }
    }

    void maybeBackup()
    const timer = window.setInterval(() => void maybeBackup(), CHECK_EVERY_MS)
    return () => window.clearInterval(timer)
  }, [directory, dispatch, enabled, intervalDays, lastAt])
}
