import { useEffect, useRef } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Outlet, useNavigate, useParams, useRouterState } from '@tanstack/react-router'
import { CommandPalette } from '@/components/CommandPalette'
import { MoveToFolderDialog } from '@/components/MoveToFolderMenu'
import { Sidebar } from '@/components/Sidebar'
import { TemplatePicker } from '@/components/TemplatePicker'
import { useLayoutTier } from '@/hooks/useLayoutTier'
import { useResponsiveSidebar } from '@/hooks/useResponsiveSidebar'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { createDocument } from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import type { DocumentTemplate } from '@/lib/templates'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
} from '@/store/documents'
import { templatePickerOpenAtom } from '@/store/settings'
import { moveDocumentPickerOpenAtom } from '@/store/folders'

function useDocumentRouteSync() {
  const { documentId } = useParams({ strict: false })
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [activeId, setActiveId] = useAtom(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)

  useEffect(() => {
    if (documentId && documentId !== activeId) {
      setActiveId(documentId)
    }
  }, [documentId, activeId, setActiveId])

  useEffect(() => {
    if (pathname === '/') {
      setActiveId(null)
      setActiveDocument(null)
    }
  }, [pathname, setActiveId, setActiveDocument])
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
  const mainRef = useRef<HTMLElement>(null)
  const layoutTier = useLayoutTier(mainRef)
  const { isCompact, sidebarOpen, setSidebarOpen } = useResponsiveSidebar()

  async function handleCreateFromTemplate(template: DocumentTemplate) {
    const doc = await createDocument({
      title: template.title,
      contentJson: JSON.stringify(template.content),
    })
    setDocuments((prev) => prependDocumentSummary(prev, doc))
    setActiveId(doc.id)
    setActiveDocument(doc)
    navigate(ROUTES.document(doc.id))
  }

  return (
    <div
      className="app-shell flex h-full min-w-0 overflow-hidden bg-[var(--color-background)]"
      data-layout-tier={layoutTier}
      data-sidebar-drawer={isCompact ? 'true' : 'false'}
    >
      {isCompact && sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop titlebar-no-drag"
          aria-label="Zavrieť knižnicu"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar isCompact={isCompact} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
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
    </div>
  )
}
