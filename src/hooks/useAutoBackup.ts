import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { configureAutoBackup, type AutoBackupConfig } from '@/lib/db/api'
import { isTauriRuntime } from '@/lib/tauri'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLastAutoBackupAt } from '@/store/settingsSlice'
import { clampAutoBackupIntervalHours } from '@/store/persistence'

const MS_PER_HOUR = 60 * 60 * 1000

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

/** How often the frontend used to poll; kept for tests / diagnostics. */
export function backupCheckIntervalMs(intervalHours: number): number {
  const hours = clampAutoBackupIntervalHours(intervalHours)
  if (hours <= 1) return 5 * 60 * 1000
  if (hours <= 6) return 15 * 60 * 1000
  return 60 * 60 * 1000
}

/**
 * Push auto-backup settings into the Rust scheduler (keeps running when the
 * webview is backgrounded) and mirror completion events into Redux.
 */
export function useAutoBackup() {
  const dispatch = useAppDispatch()
  const enabled = useAppSelector((state) => state.settings.autoBackupEnabled)
  const intervalHours = useAppSelector((state) => state.settings.autoBackupIntervalHours)
  const directory = useAppSelector((state) => state.settings.autoBackupDirectory)
  const lastAt = useAppSelector((state) => state.settings.lastAutoBackupAt)

  useEffect(() => {
    if (!isTauriRuntime()) return

    const config: AutoBackupConfig = {
      enabled,
      intervalHours: clampAutoBackupIntervalHours(intervalHours),
      directory,
      lastAt,
    }

    void configureAutoBackup(config)
      .then((next) => {
        if (next.lastAt && next.lastAt !== lastAt) {
          dispatch(setLastAutoBackupAt(next.lastAt))
        }
      })
      .catch((error) => {
        console.warn('[scribe] configure auto-backup failed', error)
      })
  }, [directory, dispatch, enabled, intervalHours, lastAt])

  useEffect(() => {
    if (!isTauriRuntime()) return

    let unlisten: (() => void) | undefined
    void listen<{ path: string; at: number }>('auto-backup-completed', (event) => {
      dispatch(setLastAutoBackupAt(event.payload.at))
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [dispatch])
}
