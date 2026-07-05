import { useEffect, useRef } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Outlet, useNavigate, useParams } from '@tanstack/react-router'
import { CommandPalette } from '@/components/CommandPalette'
import { MoveToFolderDialog } from '@/components/MoveToFolderMenu'
import { Sidebar } from '@/components/Sidebar'
import { TemplatePicker } from '@/components/TemplatePicker'
import { useLayoutTier } from '@/hooks/useLayoutTier'
import { useResponsiveSidebar } from '@/hooks/useResponsiveSidebar'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { createDocument } from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { toast } from '@/lib/toast'
import { ROUTES } from '@/lib/routes'
import type { DocumentTemplate } from '@/lib/templates'
import { InputDialogHost } from '@/components/InputDialogHost'
import { ToastHost } from '@/components/ToastHost'
import { TrashDialog } from '@/components/TrashDialog'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
  focusModeAtom,
} from '@/store/documents'
import { templatePickerOpenAtom } from '@/store/settings'
import { moveDocumentPickerOpenAtom } from '@/store/folders'

function useDocumentRouteSync() {
  const { documentId } = useParams({ strict: false })
  const [activeId, setActiveId] = useAtom(activeDocumentIdAtom)

  useEffect(() => {
    if (documentId && documentId !== activeId) {
      setActiveId(documentId)
    }
  }, [documentId, activeId, setActiveId])
}

export function AppLayout() {
  useDocumentRouteSync()
  useKeyboardShortcuts()
  const [templatePickerOpen, setTemplatePickerOpen] = useAtom(templatePickerOpenAtom)
  const [movePickerOpen, setMovePickerOpen] = useAtom(moveDocumentPickerOpenAtom)
  const activeDocument = useAtomValue(activeDocumentAtom)
  const setActiveId = useSetAtom(activeDocumentIdAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)

  const navigate = useNavigate()
  const focusMode = useAtomValue(focusModeAtom)
  const mainRef = useRef<HTMLElement>(null)
  const layoutTier = useLayoutTier(mainRef)
  const { isCompact, sidebarOpen, setSidebarOpen } = useResponsiveSidebar()

  async function handleCreateFromTemplate(template: DocumentTemplate) {
    try {
      const doc = await createDocument({
        title: template.title,
        contentJson: JSON.stringify(template.content),
      })
      setDocuments((prev) => prependDocumentSummary(prev, doc))
      setActiveId(doc.id)
      setActiveDocument(doc)
      toast.success('Dokument vytvorený', doc.title)
      navigate(ROUTES.document(doc.id))
    } catch (error) {
      toast.error('Nepodarilo sa vytvoriť dokument', String(error))
    }
  }

  return (
    <div
      className="relative flex h-full min-w-0 overflow-hidden bg-[var(--color-background)]"
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
      <main ref={mainRef} className="app-main relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
      <TemplatePicker
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        onSelect={(template) => void handleCreateFromTemplate(template)}
      />
      <CommandPalette />
      <MoveToFolderDialog
        open={movePickerOpen}
        documentId={activeDocument?.id ?? null}
        folderId={activeDocument?.folderId ?? null}
        onOpenChange={setMovePickerOpen}
      />
      <InputDialogHost />
      <TrashDialog />
      <ToastHost />
    </div>
  )
}
