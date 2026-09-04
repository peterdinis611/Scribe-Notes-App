import { useTranslation } from 'react-i18next'
import { FolderInput, Trash2, X } from 'lucide-react'
import { confirm } from '@tauri-apps/plugin-dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { restoreTrashedDocuments, trashDocuments } from '@/lib/trash-document'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { clearSelectedDocuments } from '@/store/documentsSlice'
import { setMoveDocumentPickerOpen } from '@/store/foldersSlice'

export function LibraryBulkBar() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const selected = useAppSelector((state) => state.documents.selectedDocumentIds)
  const documents = useAppSelector((state) => state.documents.documents)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const openDocumentIds = useAppSelector((state) => state.documents.openDocumentIds)
  const secondaryDocumentId = useAppSelector((state) => state.documents.secondaryDocumentId)

  if (selected.length === 0) return null

  const firstId = selected[0] ?? null

  async function handleDelete() {
    const ok = await confirm(
      t('library.bulk.deleteConfirm', { count: selected.length }),
      { title: t('library.bulk.deleteTitle'), kind: 'warning' },
    )
    if (!ok) return

    try {
      const removed = await trashDocuments({
        ids: selected,
        documents,
        activeId,
        openDocumentIds,
        secondaryDocumentId,
        dispatch,
        navigate,
      })
      dispatch(clearSelectedDocuments())
      toast.success(t('library.bulk.deleted', { count: removed.length }), undefined, {
        action: {
          label: t('common.undo'),
          onClick: () => {
            void restoreTrashedDocuments({
              documents: removed,
              dispatch,
            }).catch((error) => toast.error(t('toasts.undoTrashError'), String(error)))
          },
        },
      })
    } catch (error) {
      toast.error(t('library.bulk.deleteError'), String(error))
    }
  }

  return (
    <div className="library-bulk-bar titlebar-no-drag">
      <span className="library-bulk-count">{t('library.bulk.selected', { count: selected.length })}</span>
      <div className="library-bulk-actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          disabled={!firstId}
          onClick={() => {
            if (!firstId) return
            dispatch(setMoveDocumentPickerOpen(true))
          }}
        >
          <FolderInput className="h-3 w-3" />
          {t('library.bulk.move')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px] text-[var(--color-destructive)]"
          onClick={() => void handleDelete()}
        >
          <Trash2 className="h-3 w-3" />
          {t('common.delete')}
        </Button>
        <button
          type="button"
          className="library-bulk-clear"
          aria-label={t('library.bulk.clear')}
          onClick={() => dispatch(clearSelectedDocuments())}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
