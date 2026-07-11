import { useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Outlet, useNavigate, useParams } from '@tanstack/react-router'
import { CommandPalette } from '@/components/CommandPalette'
import { AppHeader } from '@/components/layout/AppHeader'
import { FocusModeExitBar } from '@/components/editor/FocusModeExitBar'
import { MoveToFolderDialog } from '@/components/MoveToFolderMenu'
import { Sidebar } from '@/components/Sidebar'
import { TemplatePicker } from '@/components/TemplatePicker'
import { useLayoutTier } from '@/hooks/useLayoutTier'
import { useResponsiveSidebar } from '@/hooks/useResponsiveSidebar'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { createDocument, flushPendingWrites } from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { applyDiskPersistResult } from '@/lib/disk-sync'
import { toast } from '@/lib/toast'
import { ROUTES } from '@/lib/routes'
import type { DocumentTemplate } from '@/lib/templates'
import { InputDialogHost } from '@/components/InputDialogHost'
import { StorageAccessDialogHost } from '@/components/StorageAccessDialogHost'
import { SaveCustomTemplateDialogHost } from '@/components/SaveCustomTemplateDialogHost'
import { ToastHost } from '@/components/ToastHost'
import { TrashDialog } from '@/components/TrashDialog'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'
import { setTemplatePickerOpen } from '@/store/settingsSlice'
import { setMoveDocumentPickerOpen } from '@/store/foldersSlice'

function useDocumentRouteSync() {
  const { documentId } = useParams({ strict: false })
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (!documentId || documentId === activeId) return
    dispatch(setActiveDocumentId(documentId))
    const cached = peekCachedDocument(documentId)
    if (cached) dispatch(setActiveDocument(cached))
  }, [activeId, dispatch, documentId])
}

export function AppLayout() {
  useDocumentRouteSync()
  useKeyboardShortcuts()
  const templatePickerOpen = useAppSelector((state) => state.settings.templatePickerOpen)
  const movePickerOpen = useAppSelector((state) => state.folders.moveDocumentPickerOpen)
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const dispatch = useAppDispatch()

  const navigate = useNavigate()
  const mainRef = useRef<HTMLElement>(null)
  const layoutTier = useLayoutTier(mainRef)
  const { isCompact, sidebarOpen, setSidebarOpen } = useResponsiveSidebar()

  async function handleCreateFromTemplate(template: DocumentTemplate) {
    try {
      const doc = await createDocument({
        title: template.title,
        contentJson: JSON.stringify(template.content),
      })
      flushSync(() => {
        dispatch(updateDocuments((prev) => prependDocumentSummary(prev, doc)))
        dispatch(setActiveDocumentId(doc.id))
        dispatch(setActiveDocument(doc))
        dispatch(setSaveStatus('saved'))
      })
      dispatch(setTemplatePickerOpen(false))
      await navigate(ROUTES.document(doc.id))
      toast.success('Dokument vytvorený', doc.title)
      try {
        const result = await flushPendingWrites(doc.id)
        applyDiskPersistResult(dispatch, result)
      } catch {
        // Ignore disk flush transport errors after create.
      }
    } catch (error) {
      toast.error('Nepodarilo sa vytvoriť dokument', String(error))
      throw error
    }
  }

  return (
    <div
      className="app-shell"
      data-layout-tier={layoutTier}
      data-sidebar-drawer={isCompact ? 'true' : 'false'}
      data-focus-mode={focusMode ? 'true' : 'false'}
    >
      {!focusMode && (
        <>
          {isCompact && sidebarOpen && (
            <button
              type="button"
              className="titlebar-no-drag fixed inset-0 z-[35] cursor-default border-none bg-black/38 backdrop-blur-[2px]"
              aria-label="Zavrieť knižnicu"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <Sidebar isCompact={isCompact} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        </>
      )}

      <div className="app-workspace titlebar-no-drag titlebar-interactive">
        <FocusModeExitBar />
        <AppHeader />
        <main
          ref={mainRef}
          className="app-main relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <Outlet />
        </main>
      </div>

      <TemplatePicker
        open={templatePickerOpen}
        onClose={() => dispatch(setTemplatePickerOpen(false))}
        onSelect={(template) => handleCreateFromTemplate(template)}
      />
      <CommandPalette />
      <MoveToFolderDialog
        open={movePickerOpen}
        documentId={activeDocument?.id ?? null}
        folderId={activeDocument?.folderId ?? null}
        onOpenChange={(open) => dispatch(setMoveDocumentPickerOpen(open))}
      />
      <InputDialogHost />
      <StorageAccessDialogHost />
      <SaveCustomTemplateDialogHost />
      <TrashDialog />
      <ToastHost />
    </div>
  )
}
