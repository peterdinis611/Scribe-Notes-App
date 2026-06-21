import { useAtomValue, useSetAtom } from 'jotai'
import { useNavigate } from '@tanstack/react-router'
import {
  Check,
  ChevronDown,
  FileDown,
  FileSymlink,
  FolderInput,
  Loader2,
  Plus,
  Settings2,
} from 'lucide-react'
import { DocumentTitleField } from '@/components/DocumentTitleField'
import { MoveToFolderMenu } from '@/components/MoveToFolderMenu'
import { countWords } from '@/lib/utils'
import { exportDocument, pickAndImportFile, revealInFinder } from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { tiptapJsonToHtml } from '@/lib/export/html'
import { tiptapJsonToMarkdown } from '@/lib/export/markdown'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import { ROUTES } from '@/lib/routes'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
  saveStatusAtom,
} from '@/store/documents'
import { templatePickerOpenAtom } from '@/store/settings'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function SaveStatus() {
  const status = useAtomValue(saveStatusAtom)

  if (status === 'saving') {
    return (
      <span className="status-pill is-saving">
        <Loader2 className="h-3 w-3 animate-spin" />
        Ukladám
      </span>
    )
  }

  if (status === 'error') {
    return <span className="status-pill is-error">Chyba ukladania</span>
  }

  return (
    <span className="status-pill is-saved">
      <Check className="h-3 w-3" />
      Uložené
    </span>
  )
}

export function EditorHeader() {
  const document = useAtomValue(activeDocumentAtom)
  const setActiveId = useSetAtom(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const setSaveStatus = useSetAtom(saveStatusAtom)
  const setTemplatePickerOpen = useSetAtom(templatePickerOpenAtom)
  const navigate = useNavigate()
  const words = document ? countWords(document.contentJson) : 0

  async function handleImport() {
    const doc = await pickAndImportFile()
    if (!doc) return
    setDocuments((prev) => prependDocumentSummary(prev, doc))
    setActiveId(doc.id)
    setActiveDocument(doc)
    setSaveStatus('saved')
    navigate(ROUTES.document(doc.id))
  }

  async function handleRevealFile() {
    if (document?.filePath) {
      await revealInFinder(document.filePath)
    }
  }

  async function handleExport(format: 'pdf' | 'docx' | 'txt' | 'pages' | 'md') {
    if (!document) return
    const html = tiptapJsonToHtml(document.contentJson, document.title)
    const plainText = tiptapToPlainText(document.contentJson)
    const markdown = tiptapJsonToMarkdown(document.contentJson, document.title)
    const result = await exportDocument(html, plainText, document.title, format, markdown)
    if (result?.path) {
      await revealInFinder(result.path)
    }
  }

  return (
    <header className="editor-header titlebar-drag">
      <div className="editor-header-left titlebar-no-drag">
        <Button variant="default" size="sm" onClick={() => setTemplatePickerOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Nový
        </Button>
        <Button variant="outline" size="sm" onClick={() => void handleImport()}>
          <FolderInput className="h-3.5 w-3.5" />
          Import
        </Button>

        {document && (
          <>
            <span className="editor-header-divider" aria-hidden="true" />
            {document.filePath && (
              <Button variant="ghost" size="sm" onClick={() => void handleRevealFile()}>
                <FileSymlink className="h-3.5 w-3.5" />
                Súbor
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <FileDown className="h-3.5 w-3.5" />
                  Export
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[180px]">
                <DropdownMenuItem onClick={() => void handleExport('pdf')}>PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleExport('docx')}>Word (DOCX)</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handleExport('txt')}>Text (TXT)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleExport('md')}>Markdown (MD)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleExport('pages')}>Apple Pages</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      <div className="editor-header-center titlebar-no-drag">
        {document ? (
          <DocumentTitleField
            documentId={document.id}
            title={document.title}
            variant="header"
          />
        ) : (
          <p className="editor-header-title">Scribe</p>
        )}
      </div>

      <div className="editor-header-right titlebar-no-drag">
        {document && (
          <MoveToFolderMenu
            documentId={document.id}
            folderId={document.folderId}
            trigger={
              <Button variant="ghost" size="icon" title="Presunúť do priečinka" aria-label="Presunúť do priečinka">
                <FolderInput className="h-4 w-4" />
              </Button>
            }
          />
        )}
        {document && (
          <span className="editor-meta">
            {words} {words === 1 ? 'slovo' : words < 5 ? 'slová' : 'slov'}
          </span>
        )}
        {document && <SaveStatus />}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(ROUTES.settingsSection('appearance'))}
          title="Nastavenia (⌘,)"
          aria-label="Nastavenia"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
