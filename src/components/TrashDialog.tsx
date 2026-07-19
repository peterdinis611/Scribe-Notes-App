import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { confirm } from '@tauri-apps/plugin-dialog'
import { RotateCcw, Trash2 } from 'lucide-react'
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
import { formatRelativeTime } from '@/lib/utils'
import { documentToSummary } from '@/lib/db/library-sync'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setTrashOpen, updateDocuments } from '@/store/documentsSlice'

export function TrashDialog() {
  const { t } = useTranslation()
  const open = useAppSelector((state) => state.documents.trashOpen)
  const dispatch = useAppDispatch()
  const [items, setItems] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(false)

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
      }
    },
    [dispatch, t],
  )

  const handlePurge = useCallback(async (item: DocumentSummary) => {
    const confirmed = await confirm(
      t('trash.purgeConfirm', { title: item.title }),
      {
        title: t('trash.purgeTitle'),
        kind: 'warning',
        okLabel: t('trash.purgeOk'),
        cancelLabel: t('common.cancel'),
      },
    )
    if (!confirmed) return

    setItems((prev) => prev.filter((doc) => doc.id !== item.id))

    try {
      await purgeDocument(item.id)
    } catch (error) {
      setItems((prev) => [...prev, item])
      toast.error(t('toasts.trashPurgeError'), String(error))
    }
  }, [t])

  const handleEmpty = useCallback(async () => {
    if (items.length === 0) return
    const confirmed = await confirm(
      t('trash.emptyConfirm'),
      {
        title: t('trash.emptyTitle'),
        kind: 'warning',
        okLabel: t('trash.emptyOk'),
        cancelLabel: t('common.cancel'),
      },
    )
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
        <DialogContent className="max-w-lg p-0" showClose>
        <DialogHeader className="border-b border-[var(--color-border)] px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-[17px]">{t('trash.title')}</DialogTitle>
              <DialogDescription>
                {t('library.documentCount', { count: items.length })}
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleEmpty()}
              disabled={items.length === 0}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('trash.empty')}
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[min(60vh,420px)]">
          <div className="px-3 py-2">
            {loading && items.length === 0 ? (
              <p className="px-3 py-8 text-center text-[13px] text-[var(--color-muted-foreground)]">
                {t('common.loading')}
              </p>
            ) : items.length === 0 ? (
              <p className="px-3 py-8 text-center text-[13px] text-[var(--color-muted-foreground)]">
                {t('trash.hint')}
              </p>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--color-hover)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[var(--color-foreground)]">
                      {item.title || t('common.untitled')}
                    </p>
                    <p className="text-[11px] text-[var(--color-muted-foreground)]">
                      {t('trash.deletedAt', {
                        time: item.deletedAt ? formatRelativeTime(item.deletedAt) : '',
                      })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
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
                    className="hover:bg-[color-mix(in_srgb,var(--color-destructive)_12%,transparent)] hover:text-[var(--color-destructive)]"
                    title={t('trash.purgeForever')}
                    onClick={() => void handlePurge(item)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        </DialogContent>
      )}
    </Dialog>
  )
}
