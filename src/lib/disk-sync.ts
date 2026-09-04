import type { FlushPendingWritesResult, ReconcileResult } from '@/lib/db/api'
import { reconcileStorage } from '@/lib/db/api'
import { requestStorageAccessDialog } from '@/components/StorageAccessDialogHost'
import i18n from '@/i18n'
import { reloadLibraryFromBackend } from '@/lib/library-reload'
import { toast } from '@/lib/toast'
import type { AppDispatch } from '@/store/index'
import { store } from '@/store/index'
import { setDiskSyncWarning } from '@/store/documentsSlice'
import { hasStorageFolderAccess } from '@/store/persistence'

/** Minimum gap between auto reconciles (focus / interval). Manual Sync can force. */
const AUTO_RECONCILE_DEBOUNCE_MS = 15_000

let lastReconcileAt = 0
let inFlight: Promise<ReconcileResult | null> | null = null

export function getDiskSyncWarning(): string {
  return i18n.t('diskSync.warning')
}

export function applyDiskPersistResult(
  dispatch: AppDispatch,
  result: FlushPendingWritesResult,
) {
  if (result.errors.length === 0) {
    dispatch(setDiskSyncWarning(null))
    return
  }

  const warning = getDiskSyncWarning()
  const detail = result.errors[0]?.message
    ? `${warning} (${result.errors[0].message})`
    : warning

  dispatch(setDiskSyncWarning(detail))
  toast.info(i18n.t('diskSync.toastTitle'), detail)

  if (!hasStorageFolderAccess()) {
    requestStorageAccessDialog(dispatch, 'info')
  }
}

export type FolderReconcileOptions = {
  /** Bypass debounce (Settings / Diagnostics Sync button). */
  force?: boolean
  /** Toast success when nothing was pulled from disk (manual Sync). */
  announceSuccess?: boolean
}

/**
 * Reconcile SQLite ↔ documents folder, soft-reload the library when needed,
 * and toast when documents were updated from disk (e.g. iCloud / Dropbox).
 */
export async function runFolderReconcile(
  dispatch: AppDispatch,
  options: FolderReconcileOptions = {},
): Promise<ReconcileResult | null> {
  if (!options.force && !hasStorageFolderAccess()) return null

  const now = Date.now()
  if (!options.force && now - lastReconcileAt < AUTO_RECONCILE_DEBOUNCE_MS) {
    return null
  }

  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      lastReconcileAt = Date.now()
      const result = await reconcileStorage()
      const pulled =
        result.updatedFromDiskCount > 0 || result.importedCount > 0

      if (pulled) {
        await reloadLibraryFromBackend(dispatch, {
          preserveActive: true,
          refreshActive: result.updatedFromDiskCount > 0,
          getState: () => store.getState(),
        })
      }

      if (result.updatedFromDiskCount > 0) {
        toast.info(
          i18n.t('diskSync.updatedFromDiskTitle'),
          i18n.t('diskSync.updatedFromDiskDescription', {
            count: result.updatedFromDiskCount,
          }),
        )
      } else if (options.announceSuccess) {
        toast.success(i18n.t('toasts.reconcileSuccess'))
      }

      return result
    } catch (error) {
      if (options.announceSuccess) {
        toast.error(i18n.t('toasts.reconcileError'), String(error))
      }
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}
