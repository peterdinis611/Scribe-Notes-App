import { useAtom, useSetAtom } from 'jotai'
import { FileText, Search, Settings2, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DocumentTitleField } from '@/components/DocumentTitleField'
import { deleteDocument, listDocuments } from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
} from '@/store/documents'

export function Sidebar() {
  const [documents, setDocuments] = useAtom(documentsAtom)
  const [activeId, setActiveId] = useAtom(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const onSettingsPage = pathname.startsWith('/settings')
  const onEditorPage = pathname === '/' || pathname.startsWith('/doc/')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return documents
    return documents.filter((doc) => doc.title.toLowerCase().includes(q))
  }, [documents, query])

  async function handleDelete(id: string, event: React.MouseEvent) {
    event.stopPropagation()
    await deleteDocument(id)
    const items = await listDocuments()
    setDocuments(items)

    if (activeId === id) {
      const nextId = items[0]?.id ?? null
      setActiveId(nextId)
      if (!nextId) {
        setActiveDocument(null)
        navigate(ROUTES.home())
      } else {
        navigate(ROUTES.document(nextId))
      }
    }
  }

  function openDocument(id: string) {
    setActiveId(id)
    navigate(ROUTES.document(id))
  }

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand titlebar-drag">
        <div className="titlebar-no-drag">
          <p className="sidebar-brand-name">Scribe</p>
          <p className="sidebar-brand-tagline">Textový editor</p>
        </div>
      </div>

      <nav className="sidebar-nav titlebar-no-drag" aria-label="Navigácia">
        <Link
          to="/"
          className={cn('sidebar-nav-item', onEditorPage && 'is-active')}
        >
          <FileText className="h-4 w-4" />
          Editor
        </Link>
        <Link
          to="/settings/appearance"
          className={cn('sidebar-nav-item', onSettingsPage && 'is-active')}
        >
          <Settings2 className="h-4 w-4" />
          Nastavenia
        </Link>
      </nav>

      <div className="sidebar-search titlebar-no-drag">
        <div className="sidebar-search-field">
          <Search className="sidebar-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="sidebar-search-input"
            placeholder="Hľadať dokumenty…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="sidebar-list flex-1">
        <div className="sidebar-list-inner">
          {filtered.length === 0 ? (
            <p className="sidebar-empty">
              {query ? 'Žiadne výsledky.' : 'Zatiaľ žiadne dokumenty.'}
            </p>
          ) : (
            filtered.map((doc) => (
              <div
                key={doc.id}
                role="button"
                tabIndex={0}
                onClick={() => openDocument(doc.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openDocument(doc.id)
                  }
                }}
                className={cn('doc-item group titlebar-no-drag', activeId === doc.id && 'is-active')}
              >
                <div className="doc-item-icon">
                  <FileText className="h-4 w-4 stroke-[1.5]" />
                </div>
                <div className="min-w-0 flex-1">
                  <DocumentTitleField documentId={doc.id} title={doc.title} variant="sidebar" />
                  <p className="doc-item-meta">{formatRelativeTime(doc.updatedAt)}</p>
                </div>
                <button
                  type="button"
                  className="doc-item-delete"
                  onClick={(event) => void handleDelete(doc.id, event)}
                  aria-label="Vymazať"
                  title="Vymazať"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}
