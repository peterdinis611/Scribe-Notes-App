import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Outlet, useNavigate, useParams, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { listen } from '@tauri-apps/api/event'
import { AppFileDropOverlay } from '@/components/AppFileDropOverlay'
import { DndRoot } from '@/components/dnd/DndRoot'
import { RouteViewTransition } from '@/components/RouteViewTransition'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppHeader } from '@/components/layout/AppHeader'
import { DocumentTabsBar } from '@/components/layout/DocumentTabsBar'
import { FocusModeExitBar } from '@/components/editor/FocusModeExitBar'
import { ReadingModeExitBar } from '@/components/editor/ReadingModeExitBar'
import { Sidebar } from '@/components/Sidebar'
import { ToastHost } from '@/components/ToastHost'
import { DeferredAppChrome } from '@/layouts/DeferredAppChrome'
import { useAppFileDrop } from '@/hooks/useAppFileDrop'
import { useLayoutTier } from '@/hooks/useLayoutTier'
import { useResponsiveSidebar } from '@/hooks/useResponsiveSidebar'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useClipboardHistoryCapture } from '@/hooks/useClipboardHistory'
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts'
import { useFolderAutoSync } from '@/hooks/useFolderAutoSync'
import { useAutoBackup } from '@/hooks/useAutoBackup'
import { useDocumentCacheRetention } from '@/hooks/useDocumentCacheRetention'
import {
  startAgentDigestScheduler,
  stopAgentDigestScheduler,
} from '@/lib/library/agent-digest-schedule'
import { APP_VERSION } from '@/lib/app-version'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { prefetchDocument, prefetchEditorChunks, prefetchOpenDocuments } from '@/lib/cache/prefetch-document'
import { scheduleIdle } from '@/lib/schedule-idle'
import { createDocument, flushPendingWrites, type Document } from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { importDocumentFromPath } from '@/lib/import-document'
import { applyDiskPersistResult } from '@/lib/disk-sync'
import { openTodayNote } from '@/lib/journal-notes'
import { openQuickNote } from '@/lib/quick-note'
import { isOpenLibraryDocumentId } from '@/lib/trash-document'
import { toast } from '@/lib/toast'
import { ROUTES } from '@/lib/routes'
import type { DocumentTemplate } from '@/lib/templates'
import { ensureSetupCompletedForExistingUsers, readOnboardingDismissed, readSetupCompleted, readWhatsNewVersion } from '@/store/persistence'
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
  const documents = useAppSelector((state) => state.documents.documents)
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (!documentId || documentId === activeId) return
    // When activeId is cleared (close last tab / go home), do not revive from the
    // still-mounted /doc/$id route — that race sent users straight back into the doc.
    if (activeId === null) return
    // Trash switches activeId before the router URL updates — don't revive the trashed id.
    if (!isOpenLibraryDocumentId(documents, documentId)) return
    dispatch(setActiveDocumentId(documentId))
    const cached = peekCachedDocument(documentId)
    if (cached) dispatch(setActiveDocument(cached))
    else prefetchDocument(documentId, 'high')
  }, [activeId, dispatch, documentId, documents])
}

export function AppLayout() {
  useDocumentRouteSync()
  useKeyboardShortcuts()
  useClipboardHistoryCapture(true)
  useGlobalShortcuts()
  useFolderAutoSync()
  useAutoBackup()
  useDocumentCacheRetention()
  useEffect(() => {
    const cancel = scheduleIdle(() => startAgentDigestScheduler(), 5000)
    return () => {
      cancel()
      stopAgentDigestScheduler()
    }
  }, [])
  const templatePickerOpen = useAppSelector((state) => state.settings.templatePickerOpen)
  const showDocumentTabs = useAppSelector((state) => state.settings.showDocumentTabs)
  const movePickerOpen = useAppSelector((state) => state.folders.moveDocumentPickerOpen)
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const selectedDocumentIds = useAppSelector((state) => state.documents.selectedDocumentIds)
  const documents = useAppSelector((state) => state.documents.documents)
  const openDocumentIds = useAppSelector((state) => state.documents.openDocumentIds)
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
  const [setupReady, setSetupReady] = useState(
    () => ensureSetupCompletedForExistingUsers() || readSetupCompleted(),
  )

  const openImportedDocuments = useCallback(
    async (docs: Document[]) => {
      if (docs.length === 0) return
      for (const doc of docs) {
        dispatch(updateDocuments((prev) => prependDocumentSummary(prev, doc)))
      }
      const last = docs[docs.length - 1]!
      dispatch(setActiveDocumentId(last.id))
      dispatch(setActiveDocument(last))
      dispatch(setSaveStatus('saved'))
      await navigate(ROUTES.document(last.id))
    },
    [dispatch, navigate],
  )

  const fileDrop = useAppFileDrop({
    onImported: openImportedDocuments,
    t: (key, options) => t(key, options),
    toastSuccess: (title, detail) => toast.success(title, detail),
    toastError: (title, detail) => toast.error(title, detail),
    toastInfo: (title, detail) => toast.info(title, detail),
  })

  useEffect(() => scheduleIdle(() => prefetchEditorChunks(), 3500), [])

  useEffect(() => {
    const activeId = activeDocument?.id
    const prioritized = activeId
      ? [activeId, ...openDocumentIds.filter((id) => id !== activeId)]
      : openDocumentIds
    // Warm a few open tabs after paint — don't flood IPC on cold start.
    return scheduleIdle(
      () => prefetchOpenDocuments(prioritized, { limit: 4, priority: 'high' }),
      2500,
    )
  }, [activeDocument?.id, openDocumentIds])

  function maybeOpenWhatsNew() {
    if (readWhatsNewVersion() !== APP_VERSION) {
      setWhatsNewOpen(true)
    }
  }

  useEffect(() => {
    if (setupReady && readOnboardingDismissed() && readWhatsNewVersion() !== APP_VERSION) {
      setWhatsNewOpen(true)
    }
  }, [setupReady])

  useEffect(() => {
    const unlisteners: Array<() => void> = []

    void listen<string>('open-file', (event) => {
      void importDocumentFromPath(event.payload)
        .then(async (doc) => {
          await openImportedDocuments([doc])
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
  }, [dispatch, documents, folders, navigate, openImportedDocuments, t])

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
    <TooltipProvider>
    <DndRoot>
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
        {showDocumentTabs ? <DocumentTabsBar /> : null}
        <main
          ref={mainRef}
          className="app-main relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <Suspense fallback={null}>
            <RouteViewTransition>
              <Outlet />
            </RouteViewTransition>
          </Suspense>
        </main>
      </div>

      <DeferredAppChrome
        templatePickerOpen={templatePickerOpen}
        onTemplatePickerClose={() => dispatch(setTemplatePickerOpen(false))}
        onSelectTemplate={async (template) => {
          await handleCreateFromTemplate(template)
        }}
        movePickerOpen={movePickerOpen}
        moveDocumentId={activeDocument?.id ?? selectedDocumentIds[0] ?? null}
        moveDocumentIds={
          selectedDocumentIds.length > 0
            ? selectedDocumentIds
            : activeDocument?.id
              ? [activeDocument.id]
              : []
        }
        moveFolderId={activeDocument?.folderId ?? null}
        onMovePickerOpenChange={(open) => dispatch(setMoveDocumentPickerOpen(open))}
        setupReady={setupReady}
        onSetupFinished={() => setSetupReady(true)}
        onboardingEnabled={setupReady}
        onOnboardingFinished={maybeOpenWhatsNew}
        whatsNewOpen={whatsNewOpen}
        onWhatsNewClose={() => setWhatsNewOpen(false)}
      />
      <AppFileDropOverlay
        active={fileDrop.active}
        busy={fileDrop.busy}
        count={fileDrop.hoverCount}
      />
      <ToastHost />
    </div>
    </DndRoot>
    </TooltipProvider>
  )
}
