import { useMemo } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Clock, FileText, FolderInput, Plus } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { APP_SHORTCUTS } from '@/lib/shortcuts'
import { pickAndImportFile } from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import { formatRelativeTime } from '@/lib/utils'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
  saveStatusAtom,
} from '@/store/documents'
import { templatePickerOpenAtom } from '@/store/settings'

export function WelcomeScreen() {
  const documents = useAtomValue(documentsAtom)
  const setTemplatePickerOpen = useSetAtom(templatePickerOpenAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const setActiveId = useSetAtom(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setSaveStatus = useSetAtom(saveStatusAtom)
  const navigate = useNavigate()

  const recentDocuments = useMemo(
    () => [...documents].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6),
    [documents],
  )

  async function handleImport() {
    const doc = await pickAndImportFile()
    if (!doc) return
    setDocuments((prev) => prependDocumentSummary(prev, doc))
    setActiveId(doc.id)
    setActiveDocument(doc)
    setSaveStatus('saved')
    navigate(ROUTES.document(doc.id))
  }

  function openDocument(id: string) {
    setActiveId(id)
    navigate(ROUTES.document(id))
  }

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <div className="welcome-icon">
          <FileText className="h-8 w-8 stroke-[1.25]" />
        </div>
        <h1 className="welcome-title">Vitajte v Scribe</h1>
        <p className="welcome-subtitle">
          Vytvorte nový dokument, importujte existujúci súbor alebo pokračujte v písaní.
        </p>

        <div className="welcome-actions">
          <Button variant="default" onClick={() => setTemplatePickerOpen(true)}>
            <Plus className="h-4 w-4" />
            Nový dokument
          </Button>
          <Button variant="outline" onClick={() => void handleImport()}>
            <FolderInput className="h-4 w-4" />
            Importovať
          </Button>
        </div>

        {recentDocuments.length > 0 && (
          <div className="welcome-recent">
            <h2 className="welcome-recent-title">Nedávne dokumenty</h2>
            <ul className="welcome-recent-list">
              {recentDocuments.map((doc) => (
                <li key={doc.id}>
                  <button type="button" className="welcome-recent-item" onClick={() => openDocument(doc.id)}>
                    <FileText className="h-4 w-4 shrink-0 opacity-50" />
                    <span className="welcome-recent-item-title">{doc.title}</span>
                    <span className="welcome-recent-item-time">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(doc.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="welcome-shortcuts">
          {APP_SHORTCUTS.slice(0, 4).map((shortcut) => (
            <Shortcut key={shortcut.label} label={shortcut.label} keys={shortcut.keys} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Shortcut({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="welcome-shortcut">
      <span className="welcome-shortcut-label">{label}</span>
      <span className="welcome-shortcut-keys">
        {keys.map((key) => (
          <kbd key={key}>{key}</kbd>
        ))}
      </span>
    </div>
  )
}
