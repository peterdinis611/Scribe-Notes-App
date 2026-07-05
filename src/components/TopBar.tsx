import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Check,
  Circle,
  Focus,
  Loader2,
  Plus,
  Settings2,
} from 'lucide-react'
import { DocumentTitleField } from '@/components/DocumentTitleField'
import { EditorDocumentToolsMenu } from '@/components/editor/EditorDocumentToolsMenu'
import { EditorFileMenu } from '@/components/editor/EditorFileMenu'
import { EditorViewModeToggle } from '@/components/editor/EditorViewModeToggle'
import { SidebarToggle } from '@/components/SidebarToggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { exportDocument, pickAndImportFile, revealInFinder } from '@/lib/db/api'
import { fileBasename, toast } from '@/lib/toast'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { tiptapJsonToHtml } from '@/lib/export/html'
import { tiptapJsonToMarkdown } from '@/lib/export/markdown'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import { ROUTES } from '@/lib/routes'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
  focusModeAtom,
  saveStatusAtom,
} from '@/store/documents'
import { editorViewModeAtom, pageSetupAtom, templatePickerOpenAtom } from '@/store/settings'

const PdfPreviewDialog = lazy(() =>
  import('@/components/export/PdfPreviewDialog').then((module) => ({
    default: module.PdfPreviewDialog,
  })),
)

function SaveStatus() {
  const status = useAtomValue(saveStatusAtom)

  if (status === 'saving') {
    return (
      <Badge className="status-pill h-6 gap-1 bg-[var(--color-hover)] px-2 text-[11px] font-medium text-[var(--color-muted-foreground)]">
        <Loader2 className="h-3 w-3 animate-spin" />
        Ukladám
      </Badge>
    )
  }

  if (status === 'dirty') {
    return (
      <Badge className="status-pill h-6 gap-1 border-transparent bg-[color-mix(in_srgb,#ff9500_14%,transparent)] px-2 text-[11px] font-medium text-[#c93400] dark:text-[#ff9f0a]">
        <Circle className="h-2.5 w-2.5 fill-current" />
        Neuložené
      </Badge>
    )
  }

  if (status === 'error') {
    return (
      <Badge className="status-pill h-6 border-transparent bg-[color-mix(in_srgb,var(--color-destructive)_14%,transparent)] px-2 text-[11px] font-medium text-[var(--color-destructive)]">
        Chyba ukladania
      </Badge>
    )
  }

  return (
    <Badge className="status-pill h-6 gap-1 border-transparent bg-[color-mix(in_srgb,#34c759_14%,transparent)] px-2 text-[11px] font-medium text-[#248a3d] dark:text-[#30d158]">
      <Check className="h-3 w-3" />
      Uložené
    </Badge>
  )
}

export function EditorHeader({ onPrint }: { onPrint?: () => void }) {
  const document = useAtomValue(activeDocumentAtom)
  const pageSetup = useAtomValue(pageSetupAtom)
  const viewMode = useAtomValue(editorViewModeAtom)
  const setActiveId = useSetAtom(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const setSaveStatus = useSetAtom(saveStatusAtom)
  const setTemplatePickerOpen = useSetAtom(templatePickerOpenAtom)
  const navigate = useNavigate()
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [focusMode, setFocusMode] = useAtom(focusModeAtom)

  const pdfPreviewPayload = useMemo(() => {
    if (!document) return null
    return {
      title: document.title,
      html: tiptapJsonToHtml(document.contentJson, document.title, { pageSetup }),
      plainText: tiptapToPlainText(document.contentJson),
      markdown: tiptapJsonToMarkdown(document.contentJson, document.title),
      pageSetup,
    }
  }, [document, pageSetup])

  async function handleExport(format: 'pdf' | 'docx' | 'txt' | 'pages' | 'md') {
    if (!pdfPreviewPayload) return
    const { html, plainText, title, markdown, pageSetup: exportPageSetup } = pdfPreviewPayload
    try {
      const result = await exportDocument(html, plainText, title, format, markdown, exportPageSetup)
      if (result?.path) {
        toast.success('Export dokončený', fileBasename(result.path))
        await revealInFinder(result.path)
      }
    } catch {
      toast.error('Export zlyhal')
    }
  }

  async function handleImport() {
    const doc = await pickAndImportFile()
    if (!doc) return
    setDocuments((prev) => prependDocumentSummary(prev, doc))
    setActiveId(doc.id)
    setActiveDocument(doc)
    setSaveStatus('saved')
    toast.success('Dokument importovaný', doc.title)
    navigate(ROUTES.document(doc.id))
  }

  async function handleRevealFile() {
    if (document?.filePath) {
      await revealInFinder(document.filePath)
    }
  }

  return (
    <>
      <header className="editor-header titlebar-drag relative flex h-12 min-w-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-toolbar)] px-4 backdrop-blur-xl backdrop-saturate-[180%] [[data-sidebar-drawer=true]_&]:pl-[78px]">
        <div className="editor-header-left titlebar-no-drag titlebar-interactive relative z-10 flex min-w-0 flex-1 items-center justify-start gap-1.5 overflow-x-auto pr-[max(96px,14vw)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
          <SidebarToggle />
          <Button variant="default" size="sm" onClick={() => setTemplatePickerOpen(true)}>
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span className="editor-header-label [[data-layout-tier=medium]_&]:hidden [[data-layout-tier=narrow]_&]:hidden [[data-layout-tier=tight]_&]:hidden">
              Nový
            </span>
          </Button>
          {document && (
            <EditorFileMenu
              hasFilePath={!!document.filePath}
              onImport={() => void handleImport()}
              onRevealFile={() => void handleRevealFile()}
              onPdfPreview={() => setPdfPreviewOpen(true)}
              onPrint={onPrint}
              onExport={(format) => void handleExport(format)}
            />
          )}
        </div>

        <div className="editor-header-center titlebar-no-drag pointer-events-none absolute left-1/2 z-[5] flex max-w-[min(360px,42vw)] -translate-x-1/2 justify-center [&>*]:pointer-events-auto">
          {document ? (
            <DocumentTitleField documentId={document.id} title={document.title} variant="header" />
          ) : (
            <p className="editor-header-title m-0 max-w-[360px] truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--color-foreground)]">
              Scribe
            </p>
          )}
        </div>

        <div className="editor-header-right titlebar-no-drag titlebar-interactive relative z-10 flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto pl-[max(96px,14vw)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
          {focusMode && (
            <Button
              variant="outline"
              size="sm"
              className="editor-focus-exit"
            title="Ukončiť režim sústredenia (Esc)"
              onClick={() => setFocusMode(false)}
            >
              <Focus className="h-3.5 w-3.5 shrink-0" />
              <span className="[[data-layout-tier=medium]_&]:hidden [[data-layout-tier=narrow]_&]:hidden [[data-layout-tier=tight]_&]:hidden">
                Ukončiť sústredenie
              </span>
            </Button>
          )}
          {document && !focusMode && <EditorDocumentToolsMenu viewMode={viewMode} />}
          {document && !focusMode && <EditorViewModeToggle />}
          {document && <SaveStatus />}
          {!focusMode && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(ROUTES.settingsSection('appearance'))}
              title="Nastavenia (⌘,)"
              aria-label="Nastavenia"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      {pdfPreviewPayload && (
        <Suspense fallback={null}>
          <PdfPreviewDialog
            open={pdfPreviewOpen}
            onOpenChange={setPdfPreviewOpen}
            title={pdfPreviewPayload.title}
            html={pdfPreviewPayload.html}
            plainText={pdfPreviewPayload.plainText}
            pageSetup={pdfPreviewPayload.pageSetup}
            onExport={() => void handleExport('pdf')}
          />
        </Suspense>
      )}
    </>
  )
}
