import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, FileText, FolderInput, GitFork, KeyRound, Lock, LockOpen, SlidersHorizontal, Unlock } from 'lucide-react'
import { PageSetupDialog } from '@/components/editor/PageSetupDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import {
  isDocumentPasswordProtected,
  lockPasswordDocument,
  protectDocumentWithPassword,
  removeDocumentPassword,
  unlockPasswordDocument,
} from '@/lib/vault/document-protect'
import { isDocumentUnlocked } from '@/lib/vault/session'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLibraryGraphAroundActive, setLibraryView } from '@/store/documentsSlice'
import { setMoveDocumentPickerOpen } from '@/store/foldersSlice'

type EditorDocumentToolsMenuProps = {
  viewMode: 'rich' | 'markdown'
}

export function EditorDocumentToolsMenu({ viewMode }: EditorDocumentToolsMenuProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [pageSetupOpen, setPageSetupOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const folders = useAppSelector((state) => state.folders.folders)

  if (viewMode !== 'rich') return null

  const protectedDoc = isDocumentPasswordProtected(activeDocument)
  const unlocked = activeDocument ? isDocumentUnlocked(activeDocument.id) : false
  const locked = Boolean(activeDocument?.vaultLocked) || (protectedDoc && !unlocked)
  const folder = folders.find((item) => item.id === activeDocument?.folderId)
  const inFolderVault = Boolean(folder?.isVault)

  async function runProtectAction(
    action: () => Promise<unknown>,
    successKey: string,
  ) {
    if (!activeDocument || busy) return
    setBusy(true)
    try {
      const result = await action()
      if (result) toast.success(t(successKey))
    } catch (error) {
      toast.error(t('vault.doc.actionError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="editor-tools-trigger"
            title={t('printLayout.moreActions')}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
            <span className="[[data-layout-tier=medium]_&]:hidden [[data-layout-tier=narrow]_&]:hidden [[data-layout-tier=tight]_&]:hidden">
              {t('printLayout.more')}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          <DropdownMenuItem onClick={() => setPageSetupOpen(true)}>
            <FileText className="h-4 w-4 shrink-0" />
            {t('printLayout.pageSetup')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => dispatch(setMoveDocumentPickerOpen(true))}>
            <FolderInput className="h-4 w-4 shrink-0" />
            {t('printLayout.moveToFolder')}
          </DropdownMenuItem>
          {activeDocument ? (
            <DropdownMenuItem
              onClick={() => {
                dispatch(setLibraryGraphAroundActive(true))
                dispatch(setLibraryView('graph'))
                void navigate(ROUTES.graph({ around: true }))
              }}
            >
              <GitFork className="h-4 w-4 shrink-0" />
              {t('printLayout.graphAround')}
            </DropdownMenuItem>
          ) : null}

          {activeDocument ? (
            <>
              <DropdownMenuSeparator />
              {!protectedDoc && !inFolderVault ? (
                <DropdownMenuItem
                  disabled={busy}
                  onClick={() =>
                    void runProtectAction(
                      () => protectDocumentWithPassword(activeDocument, t),
                      'vault.doc.protectedToast',
                    )
                  }
                >
                  <KeyRound className="h-4 w-4 shrink-0" />
                  {t('vault.doc.protect')}
                </DropdownMenuItem>
              ) : null}
              {protectedDoc && locked ? (
                <DropdownMenuItem
                  disabled={busy}
                  onClick={() =>
                    void runProtectAction(
                      () => unlockPasswordDocument(activeDocument, t),
                      'vault.doc.unlockedToast',
                    )
                  }
                >
                  <Unlock className="h-4 w-4 shrink-0" />
                  {t('vault.doc.unlock')}
                </DropdownMenuItem>
              ) : null}
              {protectedDoc && !locked ? (
                <>
                  <DropdownMenuItem
                    disabled={busy}
                    onClick={() =>
                      void runProtectAction(
                        () => lockPasswordDocument(activeDocument),
                        'vault.doc.lockedToast',
                      )
                    }
                  >
                    <Lock className="h-4 w-4 shrink-0" />
                    {t('vault.doc.lock')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={busy}
                    onClick={() =>
                      void runProtectAction(
                        () => removeDocumentPassword(activeDocument, t),
                        'vault.doc.removedToast',
                      )
                    }
                  >
                    <LockOpen className="h-4 w-4 shrink-0" />
                    {t('vault.doc.remove')}
                  </DropdownMenuItem>
                </>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <PageSetupDialog open={pageSetupOpen} onClose={() => setPageSetupOpen(false)} />
    </>
  )
}
