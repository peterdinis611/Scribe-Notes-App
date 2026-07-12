import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ChevronDown, Eye, FileDown, FileSymlink, FolderInput, LayoutTemplate, Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type EditorFileMenuProps = {
  hasDocument?: boolean
  hasFilePath?: boolean
  onImport: () => void
  onRevealFile?: () => void
  onPdfPreview?: () => void
  onPrint?: () => void
  onSaveAsTemplate?: () => void
  onExport?: (format: 'pdf' | 'docx' | 'txt' | 'pages' | 'md') => void
}

export function EditorFileMenu({
  hasDocument = true,
  hasFilePath = false,
  onImport,
  onRevealFile,
  onPdfPreview,
  onPrint,
  onSaveAsTemplate,
  onExport,
}: EditorFileMenuProps) {
  const { t } = useTranslation()

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
        {hasDocument && onExport && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onExport('pdf')}>{t('fileMenu.exportPdf')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('docx')}>{t('fileMenu.exportDocx')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('md')}>{t('fileMenu.exportMd')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('txt')}>{t('fileMenu.exportTxt')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('pages')}>{t('fileMenu.exportPages')}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
