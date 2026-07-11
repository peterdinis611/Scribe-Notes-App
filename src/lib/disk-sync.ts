import type { FlushPendingWritesResult } from '@/lib/db/api'
import { requestStorageAccessDialog } from '@/components/StorageAccessDialogHost'
import { toast } from '@/lib/toast'
import type { AppDispatch } from '@/store/index'
import { setDiskSyncWarning } from '@/store/documentsSlice'
import { readStorageAccessExplainerDismissed } from '@/store/persistence'

export const DISK_SYNC_WARNING =
  'Zápis .scribe súboru na disk zlyhal. Dokument je uložený v aplikácii. Skontrolujte Nastavenia → Úložisko.'

export function applyDiskPersistResult(
  dispatch: AppDispatch,
  result: FlushPendingWritesResult,
) {
  if (result.errors.length === 0) {
    dispatch(setDiskSyncWarning(null))
    return
  }

  const detail = result.errors[0]?.message
    ? `${DISK_SYNC_WARNING} (${result.errors[0].message})`
    : DISK_SYNC_WARNING

  dispatch(setDiskSyncWarning(detail))
  toast.info('Uložené iba v aplikácii', detail)

  if (!readStorageAccessExplainerDismissed()) {
    requestStorageAccessDialog(dispatch, 'info')
  }
}
