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
import { listSyncConflicts, resolveSyncConflict, type SyncConflict } from '@/lib/db/libraries-api'
import { reloadLibraryFromBackend } from '@/lib/library-reload'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId } from '@/store/documentsSlice'
import { setOpenConflictCount } from '@/store/librariesSlice'
import { setSyncConflictsOpen } from '@/store/uiSlice'

export function SyncConflictsDialog() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const open = useAppSelector((state) => state.ui.syncConflictsOpen)
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])

  useEffect(() => {
    if (!open) return
    void listSyncConflicts()
      .then((rows) => {
        setConflicts(rows)
        dispatch(setOpenConflictCount(rows.length))
      })
      .catch(() => setConflicts([]))
  }, [dispatch, open])

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
        <DialogContent className="titlebar-no-drag">
          <DialogHeader>
            <DialogTitle>{t('syncConflicts.title')}</DialogTitle>
            <DialogDescription>{t('syncConflicts.hint')}</DialogDescription>
          </DialogHeader>
          {conflicts.length === 0 ? (
            <p className="sync-conflicts-empty">{t('syncConflicts.empty')}</p>
          ) : (
            <ul className="sync-conflicts-list">
              {conflicts.map((item) => (
                <li key={item.id} className="sync-conflicts-row">
                  <div>
                    <p className="sync-conflicts-title">{item.title}</p>
                    <p className="sync-conflicts-meta">
                      {t('syncConflicts.meta', {
                        disk: item.diskUpdatedAt,
                        app: item.dbUpdatedAt,
                      })}
                    </p>
                  </div>
                  <div className="sync-conflicts-actions">
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
                    <Button type="button" size="sm" variant="ghost" onClick={() => void resolve(item.id, 'app')}>
                      {t('syncConflicts.keepApp')}
                    </Button>
                    <Button type="button" size="sm" onClick={() => void resolve(item.id, 'disk')}>
                      {t('syncConflicts.keepDisk')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}
