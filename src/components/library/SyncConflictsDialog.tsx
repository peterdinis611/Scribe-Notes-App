import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useNavigate } from '@tanstack/react-router'
import {
  getDocument,
  getDocumentRevision,
  listDocumentRevisions,
} from '@/lib/db/api'
import { listSyncConflicts, resolveSyncConflict, type SyncConflict } from '@/lib/db/libraries-api'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import { reloadLibraryFromBackend } from '@/lib/library-reload'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId } from '@/store/documentsSlice'
import { setOpenConflictCount } from '@/store/librariesSlice'
import { setSyncConflictsOpen } from '@/store/uiSlice'

type ConflictPreview = {
  appText: string | null
  diskText: string | null
}

function formatTs(value: number): string {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

export function SyncConflictsDialog() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const open = useAppSelector((state) => state.ui.syncConflictsOpen)
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, ConflictPreview>>({})
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    void listSyncConflicts()
      .then((rows) => {
        setConflicts(rows)
        dispatch(setOpenConflictCount(rows.length))
      })
      .catch(() => setConflicts([]))
  }, [dispatch, open])

  async function loadPreview(item: SyncConflict) {
    if (previews[item.id]) {
      setExpandedId((prev) => (prev === item.id ? null : item.id))
      return
    }
    setLoadingPreview(item.id)
    setExpandedId(item.id)
    try {
      const [revisions, current] = await Promise.all([
        listDocumentRevisions(item.documentId, 12),
        getDocument(item.documentId).catch(() => null),
      ])
      const before = revisions.find((rev) =>
        (rev.label || '').toLowerCase().includes('before sync conflict'),
      )
      let appText: string | null = null
      if (before) {
        const detail = await getDocumentRevision(before.id)
        appText = tiptapToPlainText(detail.contentJson).slice(0, 4000)
      }
      const diskText = current
        ? tiptapToPlainText(current.contentJson).slice(0, 4000)
        : null
      setPreviews((prev) => ({
        ...prev,
        [item.id]: { appText, diskText },
      }))
    } catch {
      setPreviews((prev) => ({
        ...prev,
        [item.id]: { appText: null, diskText: null },
      }))
    } finally {
      setLoadingPreview(null)
    }
  }

  async function resolve(id: string, keep: 'app' | 'disk') {
    try {
      await resolveSyncConflict(id, keep)
      const next = await listSyncConflicts()
      setConflicts(next)
      dispatch(setOpenConflictCount(next.length))
      await reloadLibraryFromBackend(dispatch, { preserveActive: true })
      if (next.length === 0) dispatch(setSyncConflictsOpen(false))
    } catch (error) {
      toast.error(t('syncConflicts.resolveError'), String(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => dispatch(setSyncConflictsOpen(next))}>
      {open && (
        <DialogContent className="titlebar-no-drag max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('syncConflicts.title')}</DialogTitle>
            <DialogDescription>{t('syncConflicts.hint')}</DialogDescription>
          </DialogHeader>
          {conflicts.length === 0 ? (
            <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
              {t('syncConflicts.empty')}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {conflicts.map((item) => {
                const preview = previews[item.id]
                const expanded = expandedId === item.id
                return (
                  <li key={item.id} className="rounded-lg border border-[color-mix(in_srgb,var(--color-border)_80%,transparent)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="m-0 font-[650]">{item.title}</p>
                        <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
                          {t('syncConflicts.meta', {
                            disk: formatTs(item.diskUpdatedAt),
                            app: formatTs(item.dbUpdatedAt),
                          })}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void loadPreview(item)}
                        >
                          {loadingPreview === item.id
                            ? t('common.loading')
                            : expanded
                              ? t('syncConflicts.hideDiff')
                              : t('syncConflicts.showDiff')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            dispatch(setActiveDocumentId(item.documentId))
                            void navigate(ROUTES.document(item.documentId))
                            dispatch(setSyncConflictsOpen(false))
                          }}
                        >
                          {t('syncConflicts.openDocument')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void resolve(item.id, 'app')}
                        >
                          {t('syncConflicts.keepApp')}
                        </Button>
                        <Button type="button" size="sm" onClick={() => void resolve(item.id, 'disk')}>
                          {t('syncConflicts.keepDisk')}
                        </Button>
                      </div>
                    </div>
                    {expanded ? (
                      <div className="sync-conflict-diff">
                        <div className="sync-conflict-diff-pane">
                          <p className="sync-conflict-diff-label">{t('syncConflicts.appVersion')}</p>
                          <pre className="sync-conflict-diff-body">
                            {preview?.appText?.trim() || t('syncConflicts.noAppRevision')}
                          </pre>
                        </div>
                        <div className="sync-conflict-diff-pane">
                          <p className="sync-conflict-diff-label">{t('syncConflicts.diskVersion')}</p>
                          <pre className="sync-conflict-diff-body">
                            {preview?.diskText?.trim() || t('syncConflicts.noAppRevision')}
                          </pre>
                        </div>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}
