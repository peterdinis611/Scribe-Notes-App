import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Check,
  ChevronRight,
  Circle,
  Loader2,
  Plus,
} from 'lucide-react'
import { DocumentTitleField } from '@/components/DocumentTitleField'
import { EditorDocumentToolsMenu } from '@/components/editor/EditorDocumentToolsMenu'
import { EditorFileMenu } from '@/components/editor/EditorFileMenu'
import { EditorViewModeToggle } from '@/components/editor/EditorViewModeToggle'
import { SidebarToggle } from '@/components/SidebarToggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { exportDocument, pickAndImportFile, revealInFinder } from '@/lib/db/api'
import { getCachedParsedContent } from '@/lib/cache/document-cache'
import { fileBasename, toast } from '@/lib/toast'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { tiptapJsonToHtml } from '@/lib/export/html'
import { tiptapJsonToMarkdown } from '@/lib/export/markdown'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import { ROUTES, SETTINGS_SECTIONS } from '@/lib/routes'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { editorRefs } from '@/store/editorRefs'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'
import { setTemplatePickerOpen } from '@/store/settingsSlice'
import { setSaveCustomTemplateDialog } from '@/store/templatesSlice'

const PdfPreviewDialog = lazy(() =>
  import('@/components/export/PdfPreviewDialog').then((module) => ({
    default: module.PdfPreviewDialog,
  })),
)

function SaveStatus() {
  const status = useAppSelector((state) => state.documents.saveStatus)

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

function SettingsChrome() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const active =
    SETTINGS_SECTIONS.find((section) => pathname === `/settings/${section.id}`) ??
    SETTINGS_SECTIONS[0]

  return (
    <header className="app-chrome titlebar-drag [[data-sidebar-drawer=true]_&]:pl-[78px]">
      <div className="titlebar-no-drag titlebar-interactive flex min-w-0 flex-1 items-center gap-2">
        <SidebarToggle />
        <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <span className="font-semibold text-[var(--color-foreground)]">Nastavenia</span>
          <ChevronRight className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
          <span className="truncate text-[var(--color-muted-foreground)]">{active.label}</span>
        </div>
      </div>
    </header>
  )
}

function EditorChrome() {
  const document = useAppSelector((state) => state.documents.activeDocument)
  const pageSetup = useAppSelector((state) => state.settings.pageSetup)
  const viewMode = useAppSelector((state) => state.settings.editorViewMode)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)

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
    dispatch(updateDocuments((prev) => prependDocumentSummary(prev, doc)))
    dispatch(setActiveDocumentId(doc.id))
    dispatch(setActiveDocument(doc))
    dispatch(setSaveStatus('saved'))
    toast.success('Dokument importovaný', doc.title)
    navigate(ROUTES.document(doc.id))
  }

  async function handleRevealFile() {
    if (document?.filePath) {
      await revealInFinder(document.filePath)
    }
  }

  function handleSaveAsTemplate() {
    if (!document) return
    dispatch(
      setSaveCustomTemplateDialog({
        open: true,
        content: getCachedParsedContent(document),
        suggestedName: document.title,
        suggestedTitle: document.title,
      }),
    )
  }

  return (
    <>
      <header className="app-chrome editor-header titlebar-drag [[data-sidebar-drawer=true]_&]:pl-[78px]">
        <div className="editor-header-left titlebar-no-drag titlebar-interactive flex min-w-0 flex-1 items-center justify-start gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
          <SidebarToggle />
          {document && (
            <Button variant="default" size="sm" onClick={() => dispatch(setTemplatePickerOpen(true))}>
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="editor-header-label [[data-layout-tier=medium]_&]:hidden [[data-layout-tier=narrow]_&]:hidden [[data-layout-tier=tight]_&]:hidden">
                Nový
              </span>
            </Button>
          )}
          {document && (
            <EditorFileMenu
              hasFilePath={!!document.filePath}
              onImport={() => void handleImport()}
              onRevealFile={() => void handleRevealFile()}
              onPdfPreview={() => setPdfPreviewOpen(true)}
              onPrint={editorRefs.printHandler ?? undefined}
              onSaveAsTemplate={handleSaveAsTemplate}
              onExport={(format) => void handleExport(format)}
            />
          )}
          {document ? (
            <>
              <div className="editor-header-divider" aria-hidden="true" />
              <DocumentTitleField documentId={document.id} title={document.title} variant="header" />
            </>
          ) : (
            <p className="editor-header-title m-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--color-foreground)]">
              Scribe
            </p>
          )}
        </div>

        <div className="editor-header-right titlebar-no-drag titlebar-interactive flex shrink-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
          {document && <EditorDocumentToolsMenu viewMode={viewMode} />}
          {document && <EditorViewModeToggle />}
          {document && <SaveStatus />}
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

export function AppHeader() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const focusMode = useAppSelector((state) => state.documents.focusMode)

  if (focusMode) return null
  if (pathname.startsWith('/settings')) return <SettingsChrome />
  return <EditorChrome />
}
