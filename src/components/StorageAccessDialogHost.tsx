import { useState } from 'react'
import { FolderOpen, ShieldCheck } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { pickDocumentsDirectory } from '@/lib/db/api'
import i18n from '@/i18n'
import { toast } from '@/lib/toast'
import type { AppDispatch } from '@/store/index'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  persistStorageAccessExplainerDismissed,
  persistStorageFolderAccessGranted,
  readStorageAccessExplainerDismissed,
  readStorageFolderAccessGranted,
} from '@/store/persistence'
import { setStorageSettings } from '@/store/settingsSlice'
import { setStorageAccessDialog, type StorageAccessDialogIntent } from '@/store/uiSlice'

function StorageAccessExplainerBody() {
  const { t } = useTranslation()

  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
      <p className="m-0">{t('storageAccess.body1')}</p>
      <p className="m-0">
        <Trans
          i18nKey="storageAccess.body2"
          components={{
            strong: <strong className="text-[var(--color-foreground)]" />,
            code: <code />,
          }}
        />
      </p>
      <p className="m-0">{t('storageAccess.body3')}</p>
      <p className="m-0">
        <Trans
          i18nKey="storageAccess.body4"
          components={{
            strong: <strong className="text-[var(--color-foreground)]" />,
          }}
        />
      </p>
    </div>
  )
}

export function StorageAccessDialogHost() {
  const dialog = useAppSelector((state) => state.ui.storageAccessDialog)
  const dispatch = useAppDispatch()
  const { t } = useTranslation()
  const [dontShowAgain, setDontShowAgain] = useState(false)

  function closeDialog() {
    if (dontShowAgain) {
      persistStorageAccessExplainerDismissed(true)
    }
    setDontShowAgain(false)
    dispatch(setStorageAccessDialog({ open: false }))
  }

  async function handlePickFolder() {
    if (dontShowAgain) {
      persistStorageAccessExplainerDismissed(true)
    }
    setDontShowAgain(false)
    dispatch(setStorageAccessDialog({ open: false }))

    const result = await pickDocumentsDirectory()
    if (result) {
      dispatch(setStorageSettings(result))
      persistStorageFolderAccessGranted(true)
      const shortPath = result.documentsDir.replace(/^\/Users\/[^/]+/, '~')
      toast.success(t('settings.storage.folderChanged'), shortPath)
    }
  }

  if (!dialog.open) return null

  const isPickIntent = dialog.intent === 'pick'

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeDialog()
      }}
    >
      <DialogContent className="max-w-[480px]" showClose>
        <DialogHeader>
          <div className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface))] text-[var(--color-accent)]">
            {isPickIntent ? <FolderOpen className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          </div>
          <DialogTitle>{t('storageAccess.title')}</DialogTitle>
          <DialogDescription>{t('storageAccess.description')}</DialogDescription>
        </DialogHeader>

        <StorageAccessExplainerBody />

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-[12px] text-[var(--color-muted-foreground)]">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(event) => setDontShowAgain(event.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          {t('common.dontShowAgain')}
        </label>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={closeDialog}>
            {isPickIntent ? t('common.later') : t('common.close')}
          </Button>
          {isPickIntent ? (
            <Button type="button" variant="default" size="sm" onClick={() => void handlePickFolder()}>
              {t('storageAccess.pickFolder')}
            </Button>
          ) : (
            <Button type="button" variant="default" size="sm" onClick={closeDialog}>
              {t('common.understood')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function requestStorageAccessDialog(
  dispatch: AppDispatch,
  intent: StorageAccessDialogIntent,
  options?: { force?: boolean },
) {
  if (!options?.force && readStorageFolderAccessGranted()) {
    if (intent === 'info') return false

    if (intent === 'pick') {
      void pickDocumentsDirectory().then((result) => {
        if (result) {
          dispatch(setStorageSettings(result))
          persistStorageFolderAccessGranted(true)
          const shortPath = result.documentsDir.replace(/^\/Users\/[^/]+/, '~')
          toast.success(i18n.t('settings.storage.folderChanged'), shortPath)
        }
      })
      return true
    }
  }

  if (!options?.force && readStorageAccessExplainerDismissed() && intent === 'info') {
    return false
  }

  dispatch(setStorageAccessDialog({ open: true, intent }))
  return true
}
