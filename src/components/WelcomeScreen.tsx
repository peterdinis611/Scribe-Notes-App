import { useSetAtom } from 'jotai'
import { FileText, FolderInput, Plus } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { APP_SHORTCUTS } from '@/lib/shortcuts'
import { pickAndImportFile } from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
  saveStatusAtom,
} from '@/store/documents'
import { templatePickerOpenAtom } from '@/store/settings'

export function WelcomeScreen() {
  const setTemplatePickerOpen = useSetAtom(templatePickerOpenAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const setActiveId = useSetAtom(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setSaveStatus = useSetAtom(saveStatusAtom)
  const navigate = useNavigate()

  async function handleImport() {
    const doc = await pickAndImportFile()
    if (!doc) return
    setDocuments((prev) => prependDocumentSummary(prev, doc))
    setActiveId(doc.id)
    setActiveDocument(doc)
    setSaveStatus('saved')
    navigate(ROUTES.document(doc.id))
  }

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <div className="welcome-icon">
          <FileText className="h-8 w-8 stroke-[1.25]" />
        </div>
        <h1 className="welcome-title">Vitajte v Scribe</h1>
        <p className="welcome-subtitle">
          Vytvorte nový dokument, importujte existujúci súbor alebo vyberte
          dokument v bočnom paneli.
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
