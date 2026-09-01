import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Outlet, useNavigate, useParams, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { listen } from '@tauri-apps/api/event'
import { CommandPalette } from '@/components/CommandPalette'
import { AppHeader } from '@/components/layout/AppHeader'
import { DocumentTabsBar } from '@/components/layout/DocumentTabsBar'
import { FocusModeExitBar } from '@/components/editor/FocusModeExitBar'
import { ReadingModeExitBar } from '@/components/editor/ReadingModeExitBar'
import { MoveToFolderDialog } from '@/components/MoveToFolderMenu'
import { OnboardingTour } from '@/components/OnboardingTour'
import { Sidebar } from '@/components/Sidebar'
import { TemplatePicker } from '@/components/TemplatePicker'
import { WhatsNewDialog } from '@/components/WhatsNewDialog'
import { useLayoutTier } from '@/hooks/useLayoutTier'
import { useResponsiveSidebar } from '@/hooks/useResponsiveSidebar'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { APP_VERSION } from '@/lib/app-version'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { createDocument, flushPendingWrites, importFile } from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { applyDiskPersistResult } from '@/lib/disk-sync'
import { openTodayNote } from '@/lib/journal-notes'
import { openQuickNote } from '@/lib/quick-note'
import { toast } from '@/lib/toast'
import { ROUTES } from '@/lib/routes'
import type { DocumentTemplate } from '@/lib/templates'
import { InputDialogHost } from '@/components/InputDialogHost'
import { StorageAccessDialogHost } from '@/components/StorageAccessDialogHost'
import { SaveCustomTemplateDialogHost } from '@/components/SaveCustomTemplateDialogHost'
import { ToastHost } from '@/components/ToastHost'
import { TrashDialog } from '@/components/TrashDialog'
import { readOnboardingDismissed, readWhatsNewVersion } from '@/store/persistence'
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
    // When activeId is cleared (close last tab / go home), do not revive from the
    // still-mounted /doc/$id route — that race sent users straight back into the doc.
    if (activeId === null) return
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
  const documents = useAppSelector((state) => state.documents.documents)
  const folders = useAppSelector((state) => state.folders.folders)
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const readingMode = useAppSelector((state) => state.documents.readingMode)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const onHomePage = pathname === '/'
  const onGraphPage = pathname === '/graph'
  const showSidebar = !focusMode && !onHomePage && !onGraphPage
  const dispatch = useAppDispatch()
  const { t } = useTranslation()

  const navigate = useNavigate()
  const mainRef = useRef<HTMLElement>(null)
  const layoutTier = useLayoutTier(mainRef)
  const { isCompact, sidebarOpen, setSidebarOpen } = useResponsiveSidebar()
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)

  function maybeOpenWhatsNew() {
    if (readWhatsNewVersion() !== APP_VERSION) {
      setWhatsNewOpen(true)
    }
  }

  useEffect(() => {
    if (readOnboardingDismissed() && readWhatsNewVersion() !== APP_VERSION) {
      setWhatsNewOpen(true)
    }
  }, [])

  useEffect(() => {
    const unlisteners: Array<() => void> = []

    void listen<string>('open-file', (event) => {
      void importFile(event.payload)
        .then((doc) => {
          dispatch(updateDocuments((prev) => prependDocumentSummary(prev, doc)))
          dispatch(setActiveDocumentId(doc.id))
          dispatch(setActiveDocument(doc))
          dispatch(setSaveStatus('saved'))
          void navigate(ROUTES.document(doc.id))
          toast.success(t('fileMenu.openedFromFinder', { title: doc.title }))
        })
        .catch((error) => toast.error(t('fileMenu.openFromFinderError'), String(error)))
    }).then((unlisten) => unlisteners.push(unlisten))

    void listen('tray-quick-note', () => {
      void openQuickNote(documents, dispatch, navigate, (key) => t(key)).catch((error) =>
        toast.error(String(error)),
      )
    }).then((unlisten) => unlisteners.push(unlisten))

    void listen('tray-today-note', () => {
      void openTodayNote({
        documents,
        folders,
        dispatch,
        navigate,
        t: (key, options) => t(key, options),
      }).catch((error) => toast.error(t('journal.openError'), String(error)))
    }).then((unlisten) => unlisteners.push(unlisten))

    return () => {
      for (const unlisten of unlisteners) unlisten()
    }
  }, [dispatch, documents, folders, navigate, t])

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
      toast.success(t('toasts.documentCreated'), doc.title)
      try {
        const result = await flushPendingWrites(doc.id)
        applyDiskPersistResult(dispatch, result)
      } catch {
        // Ignore disk flush transport errors after create.
      }
    } catch (error) {
      toast.error(t('toasts.documentCreateError'), String(error))
      throw error
    }
  }

  return (
    <div
      className="app-shell"
      data-layout-tier={layoutTier}
      data-sidebar-drawer={isCompact && showSidebar ? 'true' : 'false'}
      data-focus-mode={focusMode ? 'true' : 'false'}
      data-reading-mode={readingMode ? 'true' : 'false'}
      data-home={onHomePage || onGraphPage ? 'true' : 'false'}
      data-sidebar-hidden={showSidebar ? 'false' : 'true'}
    >
      {showSidebar && (
        <>
          {isCompact && sidebarOpen && (
            <button
              type="button"
              className="titlebar-no-drag fixed inset-0 z-[35] cursor-default border-none bg-black/38 backdrop-blur-[2px]"
              aria-label={t('nav.closeLibrary')}
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <Sidebar isCompact={isCompact} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        </>
      )}

      <div className="app-workspace titlebar-no-drag titlebar-interactive">
        <FocusModeExitBar />
        <ReadingModeExitBar />
        <AppHeader />
        <DocumentTabsBar />
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
      <OnboardingTour onFinished={maybeOpenWhatsNew} />
      <WhatsNewDialog open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />
      <ToastHost />
    </div>
  )
}
