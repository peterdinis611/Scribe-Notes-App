import { useState } from 'react'
import { FolderOpen, ShieldCheck } from 'lucide-react'
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
import { toast } from '@/lib/toast'
import type { AppDispatch } from '@/store/index'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  persistStorageAccessExplainerDismissed,
  readStorageAccessExplainerDismissed,
} from '@/store/persistence'
import { setStorageSettings } from '@/store/settingsSlice'
import { setStorageAccessDialog, type StorageAccessDialogIntent } from '@/store/uiSlice'

function StorageAccessExplainerBody() {
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
      <p className="m-0">
        Scribe ukladá dokumenty najprv do vlastnej databázy v aplikácii. Písať a upravovať môžete
        vždy — aj bez prístupu k priečinku Dokumenty.
      </p>
      <p className="m-0">
        Navyše vytvára záložné súbory <strong className="text-[var(--color-foreground)]">.scribe</strong>{' '}
        vo vami zvolenom priečinku (predvolene <code>~/Documents/Scribe</code>), aby ste ich mohli
        otvárať vo Finderi, zálohovať alebo zdieľať.
      </p>
      <p className="m-0">
        macOS môže zobraziť systémový dialóg s žiadosťou o prístup k priečinku Dokumenty alebo
        inému miestu. Je to normálne — systém chráni vaše súbory pred aplikáciami.
      </p>
      <p className="m-0">
        Scribe <strong className="text-[var(--color-foreground)]">neprehľadáva celý disk</strong>.
        Zapisuje len do priečinka, ktorý sami vyberiete. Ak prístup zamietnete, editor naďalej
        funguje a priečinok môžete zmeniť neskôr v Nastaveniach → Úložisko.
      </p>
    </div>
  )
}

export function StorageAccessDialogHost() {
  const dialog = useAppSelector((state) => state.ui.storageAccessDialog)
  const dispatch = useAppDispatch()
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
      const shortPath = result.documentsDir.replace(/^\/Users\/[^/]+/, '~')
      toast.success('Priečinok dokumentov zmenený', shortPath)
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
          <DialogTitle>Prečo Scribe pýta prístup k priečinku?</DialogTitle>
          <DialogDescription>
            Vysvetlenie prístupu k Dokumentom a záložným súborom .scribe
          </DialogDescription>
        </DialogHeader>

        <StorageAccessExplainerBody />

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-[12px] text-[var(--color-muted-foreground)]">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(event) => setDontShowAgain(event.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          Nezobrazovať znova
        </label>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={closeDialog}>
            {isPickIntent ? 'Neskôr' : 'Zavrieť'}
          </Button>
          {isPickIntent ? (
            <Button type="button" variant="default" size="sm" onClick={() => void handlePickFolder()}>
              Vybrať priečinok
            </Button>
          ) : (
            <Button type="button" variant="default" size="sm" onClick={closeDialog}>
              Rozumiem
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
  const dismissed = readStorageAccessExplainerDismissed()

  if (!options?.force && dismissed) {
    if (intent === 'info') return false

    if (intent === 'pick') {
      void pickDocumentsDirectory().then((result) => {
        if (result) {
          dispatch(setStorageSettings(result))
          const shortPath = result.documentsDir.replace(/^\/Users\/[^/]+/, '~')
          toast.success('Priečinok dokumentov zmenený', shortPath)
        }
      })
      return true
    }
  }

  dispatch(setStorageAccessDialog({ open: true, intent }))
  return true
}
