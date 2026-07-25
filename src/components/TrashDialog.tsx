import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { confirm } from '@tauri-apps/plugin-dialog'
import { FileText, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  emptyTrash,
  fetchDocumentFresh,
  listTrashedDocuments,
  purgeDocument,
  restoreDocument,
  type DocumentSummary,
} from '@/lib/db/api'
import { toast } from '@/lib/toast'
import { cn, formatRelativeTime } from '@/lib/utils'
import { documentToSummary } from '@/lib/db/library-sync'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setTrashOpen, updateDocuments } from '@/store/documentsSlice'

export function TrashDialog() {
  const { t } = useTranslation()
  const open = useAppSelector((state) => state.documents.trashOpen)
  const dispatch = useAppDispatch()
  const [items, setItems] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    listTrashedDocuments()
      .then(setItems)
      .catch((error) => toast.error(t('toasts.trashLoadError'), String(error)))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => {
    if (open) reload()
  }, [open, reload])

  const handleRestore = useCallback(
    async (item: DocumentSummary) => {
      setBusyId(item.id)
      setItems((prev) => prev.filter((doc) => doc.id !== item.id))
      const optimisticSummary = { ...item, deletedAt: null }
      dispatch(
        updateDocuments((prev) => [
          optimisticSummary,
          ...prev.filter((doc) => doc.id !== item.id),
        ]),
      )

      try {
        await restoreDocument(item.id)
        const fresh = await fetchDocumentFresh(item.id)
        dispatch(
          updateDocuments((prev) => {
            const summary = documentToSummary(fresh, optimisticSummary)
            return [summary, ...prev.filter((doc) => doc.id !== item.id)]
          }),
        )
        toast.success(t('toasts.documentRestored'), item.title)
      } catch (error) {
        setItems((prev) => [...prev, item])
        dispatch(updateDocuments((prev) => prev.filter((doc) => doc.id !== item.id)))
        toast.error(t('toasts.restoreError'), String(error))
      } finally {
        setBusyId(null)
      }
    },
    [dispatch, t],
  )

  const handlePurge = useCallback(
    async (item: DocumentSummary) => {
      const confirmed = await confirm(t('trash.purgeConfirm', { title: item.title }), {
        title: t('trash.purgeTitle'),
        kind: 'warning',
        okLabel: t('trash.purgeOk'),
        cancelLabel: t('common.cancel'),
      })
      if (!confirmed) return

      setBusyId(item.id)
      setItems((prev) => prev.filter((doc) => doc.id !== item.id))

      try {
        await purgeDocument(item.id)
      } catch (error) {
        setItems((prev) => [...prev, item])
        toast.error(t('toasts.trashPurgeError'), String(error))
      } finally {
        setBusyId(null)
      }
    },
    [t],
  )

  const handleEmpty = useCallback(async () => {
    if (items.length === 0) return
    const confirmed = await confirm(t('trash.emptyConfirm'), {
      title: t('trash.emptyTitle'),
      kind: 'warning',
      okLabel: t('trash.emptyOk'),
      cancelLabel: t('common.cancel'),
    })
    if (!confirmed) return

    const previousItems = items
    setItems([])

    try {
      const count = await emptyTrash()
      toast.success(t('toasts.trashEmptied'), t('library.documentCount', { count }))
    } catch (error) {
      setItems(previousItems)
      toast.error(t('toasts.trashEmptyError'), String(error))
    }
  }, [items, t])

  return (
    <Dialog open={open} onOpenChange={(next) => dispatch(setTrashOpen(next))}>
      {open && (
        <DialogContent className="trash-dialog p-0" showClose>
          <DialogHeader className="trash-dialog-header">
            <div className="trash-dialog-heading">
              <div className="trash-dialog-icon" aria-hidden="true">
                <Trash2 className="h-4 w-4" />
              </div>
              <div className="trash-dialog-heading-text">
                <DialogTitle className="trash-dialog-title">{t('trash.title')}</DialogTitle>
                <DialogDescription className="trash-dialog-count">
                  {t('library.documentCount', { count: items.length })}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="trash-dialog-scroll">
            <div className="trash-dialog-body">
              {loading && items.length === 0 ? (
                <p className="trash-dialog-loading">{t('common.loading')}</p>
              ) : items.length === 0 ? (
                <div className="trash-dialog-empty">
                  <div className="trash-dialog-empty-icon" aria-hidden="true">
                    <Trash2 className="h-5 w-5" />
                  </div>
                  <p className="trash-dialog-empty-title">{t('trash.emptyStateTitle')}</p>
                  <p className="trash-dialog-empty-text">{t('trash.emptyStateHint')}</p>
                </div>
              ) : (
                <ul className="trash-dialog-list">
                  {items.map((item) => {
                    const busy = busyId === item.id
                    return (
                      <li key={item.id} className={cn('trash-dialog-item', busy && 'is-busy')}>
                        <div className="trash-dialog-item-icon" aria-hidden="true">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="trash-dialog-item-body">
                          <p className="trash-dialog-item-title">
                            {item.title || t('common.untitled')}
                          </p>
                          <p className="trash-dialog-item-meta">
                            {t('trash.deletedAt', {
                              time: item.deletedAt ? formatRelativeTime(item.deletedAt) : '',
                            })}
                          </p>
                        </div>
                        <div className="trash-dialog-item-actions">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="trash-dialog-restore"
                            disabled={busy}
                            title={t('common.restore')}
                            onClick={() => void handleRestore(item)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            {t('common.restore')}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="trash-dialog-purge"
                            disabled={busy}
                            title={t('trash.purgeForever')}
                            onClick={() => void handlePurge(item)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </ScrollArea>

          {items.length > 0 && (
            <div className="trash-dialog-footer">
              <p className="trash-dialog-footer-hint">{t('trash.footerHint')}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="trash-dialog-empty-btn"
                onClick={() => void handleEmpty()}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('trash.empty')}
              </Button>
            </div>
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}
