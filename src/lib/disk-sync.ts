import type { FlushPendingWritesResult } from '@/lib/db/api'
import { requestStorageAccessDialog } from '@/components/StorageAccessDialogHost'
import i18n from '@/i18n'
import { toast } from '@/lib/toast'
import type { AppDispatch } from '@/store/index'
import { setDiskSyncWarning } from '@/store/documentsSlice'
import { hasStorageFolderAccess } from '@/store/persistence'

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
