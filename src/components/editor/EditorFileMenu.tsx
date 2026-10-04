import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ChevronDown, Eye, FileDown, FileSymlink, FolderInput, Home, LayoutTemplate, Printer, Share2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { listPluginExportFormats, listPluginImportFormats } from '@/lib/plugins'

type EditorFileMenuProps = {
  hasDocument?: boolean
  hasFilePath?: boolean
  onImport: () => void
  onImportPdfHighlights?: () => void
  onPluginImport?: (formatId: string) => void
  onRevealFile?: () => void
  onPdfPreview?: () => void
  onPrint?: () => void
  onSaveAsTemplate?: () => void
  onCloseDocument?: () => void
  onGoHome?: () => void
  onExport?: (format: 'pdf' | 'docx' | 'txt' | 'pages' | 'md' | 'html' | 'html-zip' | 'epub') => void
  onPluginExport?: (formatId: string) => void
  onExportSelection?: (format: 'md' | 'pdf') => void
  onExportStructuredPdf?: (kind: 'invoice' | 'library-report') => void
  onShareOpen?: () => void
  hasSelection?: boolean
}

export function EditorFileMenu({
  hasDocument = true,
  hasFilePath = false,
  onImport,
  onImportPdfHighlights,
  onPluginImport,
  onRevealFile,
  onPdfPreview,
  onPrint,
  onSaveAsTemplate,
  onCloseDocument,
  onGoHome,
  onExport,
  onPluginExport,
  onExportSelection,
  onExportStructuredPdf,
  onShareOpen,
  hasSelection = false,
}: EditorFileMenuProps) {
  const { t } = useTranslation()
  const pluginExports = listPluginExportFormats()
  const pluginImports = listPluginImportFormats()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="editor-file-menu-trigger">
          <FileDown className="h-3.5 w-3.5 shrink-0" />
          <span className="[[data-layout-tier=medium]_&]:hidden [[data-layout-tier=narrow]_&]:hidden [[data-layout-tier=tight]_&]:hidden">
            {t('fileMenu.label')}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        <DropdownMenuItem onClick={onImport}>
          <FolderInput className="h-3.5 w-3.5 shrink-0" />
          {t('fileMenu.import')}
        </DropdownMenuItem>
        {onImportPdfHighlights && (
          <DropdownMenuItem onClick={onImportPdfHighlights}>
            <FolderInput className="h-3.5 w-3.5 shrink-0" />
            {t('fileMenu.importPdfHighlights')}
          </DropdownMenuItem>
        )}
        {onPluginImport &&
          pluginImports.map((format) => (
            <DropdownMenuItem
              key={format.entryId}
              onClick={() => onPluginImport(format.entryId)}
            >
              <FolderInput className="h-3.5 w-3.5 shrink-0" />
              {format.label}
            </DropdownMenuItem>
          ))}
        {onGoHome && (
          <DropdownMenuItem onClick={onGoHome}>
            <Home className="h-3.5 w-3.5 shrink-0" />
            {t('fileMenu.goHome')}
          </DropdownMenuItem>
        )}
        {hasDocument && onCloseDocument && (
          <DropdownMenuItem onClick={onCloseDocument}>
            <X className="h-3.5 w-3.5 shrink-0" />
            {t('fileMenu.closeDocument')}
          </DropdownMenuItem>
        )}
        {hasDocument && hasFilePath && onRevealFile && (
          <DropdownMenuItem onClick={onRevealFile}>
            <FileSymlink className="h-3.5 w-3.5 shrink-0" />
            {t('fileMenu.revealInFinder')}
          </DropdownMenuItem>
        )}
        {hasDocument && onSaveAsTemplate && (
          <DropdownMenuItem onClick={onSaveAsTemplate}>
            <LayoutTemplate className="h-3.5 w-3.5 shrink-0" />
            {t('fileMenu.saveAsTemplate')}
          </DropdownMenuItem>
        )}
        {hasDocument && onPdfPreview && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onPdfPreview}>
              <Eye className="h-3.5 w-3.5 shrink-0" />
              {t('fileMenu.pdfPreview')}
            </DropdownMenuItem>
          </>
        )}
        {hasDocument && onPrint && (
          <DropdownMenuItem onClick={onPrint}>
            <Printer className="h-3.5 w-3.5 shrink-0" />
            {t('fileMenu.print')}
          </DropdownMenuItem>
        )}
        {hasDocument && onShareOpen && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onShareOpen}>
              <Share2 className="h-3.5 w-3.5 shrink-0" />
              {t('fileMenu.sharePackage')}
            </DropdownMenuItem>
          </>
        )}
        {hasDocument && onExport && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onExport('pdf')}>{t('fileMenu.exportPdf')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('docx')}>{t('fileMenu.exportDocx')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('md')}>{t('fileMenu.exportMd')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('html')}>{t('fileMenu.exportHtml')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('html-zip')}>{t('fileMenu.exportHtmlZip')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('epub')}>{t('fileMenu.exportEpub')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('txt')}>{t('fileMenu.exportTxt')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('pages')}>{t('fileMenu.exportPages')}</DropdownMenuItem>
            {onPluginExport &&
              pluginExports.map((format) => (
                <DropdownMenuItem
                  key={format.entryId}
                  onClick={() => onPluginExport(format.entryId)}
                >
                  {format.label}
                </DropdownMenuItem>
              ))}
          </>
        )}
        {onExportStructuredPdf && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onExportStructuredPdf('invoice')}>
              {t('fileMenu.exportInvoicePdf')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExportStructuredPdf('library-report')}>
              {t('fileMenu.exportLibraryReportPdf')}
            </DropdownMenuItem>
          </>
        )}
        {hasDocument && onExportSelection && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!hasSelection}
              onClick={() => onExportSelection('md')}
            >
              {t('fileMenu.exportSelectionMd')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!hasSelection}
              onClick={() => onExportSelection('pdf')}
            >
              {t('fileMenu.exportSelectionPdf')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
