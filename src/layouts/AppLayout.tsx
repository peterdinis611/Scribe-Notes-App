import { useEffect } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { Outlet, useNavigate, useParams, useRouterState } from '@tanstack/react-router'
import { CommandPalette } from '@/components/CommandPalette'
import { Sidebar } from '@/components/Sidebar'
import { TemplatePicker } from '@/components/TemplatePicker'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { createDocument, listDocuments, listFolders } from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import type { DocumentTemplate } from '@/lib/templates'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
} from '@/store/documents'
import { foldersAtom } from '@/store/folders'
import { templatePickerOpenAtom } from '@/store/settings'

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
  const setActiveId = useSetAtom(activeDocumentIdAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const setFolders = useSetAtom(foldersAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)

  const navigate = useNavigate()

  useEffect(() => {
    void listFolders().then(setFolders).catch(() => undefined)
  }, [setFolders])

  async function handleCreateFromTemplate(template: DocumentTemplate) {
    const doc = await createDocument({
      title: template.title,
      contentJson: JSON.stringify(template.content),
    })
    const items = await listDocuments()
    setDocuments(items)
    const nextFolders = await listFolders()
    setFolders(nextFolders)
    setActiveId(doc.id)
    setActiveDocument(doc)
    navigate(ROUTES.document(doc.id))
  }

  return (
    <div className="flex h-full overflow-hidden bg-[var(--color-background)]">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
      <TemplatePicker
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        onSelect={(template) => void handleCreateFromTemplate(template)}
      />
      <CommandPalette />
    </div>
  )
}
