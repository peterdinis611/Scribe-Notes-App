import { useCallback, useEffect, useState } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { confirm } from '@tauri-apps/plugin-dialog'
import { RotateCcw, Trash2, X } from 'lucide-react'
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
import { documentsAtom, trashOpenAtom } from '@/store/documents'
import { documentToSummary } from '@/lib/db/library-sync'

export function TrashDialog() {
  const [open, setOpen] = useAtom(trashOpenAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const [items, setItems] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(() => {
    setLoading(true)
    listTrashedDocuments()
      .then(setItems)
      .catch((error) => toast.error('Nepodarilo sa načítať kôš', String(error)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (open) reload()
  }, [open, reload])

  const handleRestore = useCallback(
    async (item: DocumentSummary) => {
      try {
        await restoreDocument(item.id)
        setItems((prev) => prev.filter((doc) => doc.id !== item.id))
        const fresh = await fetchDocumentFresh(item.id)
        setDocuments((prev) => {
          const summary = documentToSummary(fresh, { ...item, deletedAt: null })
          return [summary, ...prev.filter((doc) => doc.id !== item.id)]
        })
        toast.success('Dokument obnovený', item.title)
      } catch (error) {
        toast.error('Nepodarilo sa obnoviť dokument', String(error))
      }
    },
    [setDocuments],
  )

  const handlePurge = useCallback(async (item: DocumentSummary) => {
    const confirmed = await confirm(
      `Dokument „${item.title}“ sa natrvalo odstráni. Túto akciu nie je možné vrátiť.`,
      { title: 'Odstrániť natrvalo?', kind: 'warning', okLabel: 'Odstrániť', cancelLabel: 'Zrušiť' },
    )
    if (!confirmed) return
    try {
      await purgeDocument(item.id)
      setItems((prev) => prev.filter((doc) => doc.id !== item.id))
    } catch (error) {
      toast.error('Nepodarilo sa odstrániť dokument', String(error))
    }
  }, [])

  const handleEmpty = useCallback(async () => {
    if (items.length === 0) return
    const confirmed = await confirm(
      `Natrvalo sa odstráni ${items.length} dokumentov. Túto akciu nie je možné vrátiť.`,
      { title: 'Vysypať kôš?', kind: 'warning', okLabel: 'Vysypať', cancelLabel: 'Zrušiť' },
    )
    if (!confirmed) return
    try {
      const count = await emptyTrash()
      setItems([])
      toast.success('Kôš vysypaný', `${count} dokumentov odstránených`)
    } catch (error) {
      toast.error('Nepodarilo sa vysypať kôš', String(error))
    }
  }, [items.length])

  if (!open) return null

  return (
    <div
      className="trash-dialog-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false)
      }}
    >
      <div className="trash-dialog" role="dialog" aria-label="Kôš">
        <div className="trash-dialog-header">
          <div>
            <h2 className="trash-dialog-title">Kôš</h2>
            <p className="trash-dialog-subtitle">
              {items.length === 0 ? 'Kôš je prázdny' : `${items.length} dokumentov`}
            </p>
          </div>
          <div className="trash-dialog-header-actions">
            <button
              type="button"
              className="trash-dialog-empty-btn"
              onClick={() => void handleEmpty()}
              disabled={items.length === 0}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Vysypať kôš
            </button>
            <button
              type="button"
              className="trash-dialog-close"
              aria-label="Zavrieť"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="trash-dialog-list">
          {loading && items.length === 0 ? (
            <p className="trash-dialog-empty">Načítavam…</p>
          ) : items.length === 0 ? (
            <p className="trash-dialog-empty">Vymazané dokumenty sa zobrazia tu.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="trash-item">
                <div className="min-w-0 flex-1">
                  <p className="trash-item-title">{item.title || 'Bez názvu'}</p>
                  <p className="trash-item-meta">
                    Vymazané {item.deletedAt ? formatRelativeTime(item.deletedAt) : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="trash-item-action"
                  title="Obnoviť"
                  onClick={() => void handleRestore(item)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Obnoviť
                </button>
                <button
                  type="button"
                  className="trash-item-action trash-item-action--danger"
                  title="Odstrániť natrvalo"
                  onClick={() => void handlePurge(item)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
