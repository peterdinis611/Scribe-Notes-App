import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ChevronDown, Eye, FileDown, FileSymlink, FolderInput, LayoutTemplate, Printer } from 'lucide-react'

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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="editor-file-menu-trigger">
          <FileDown className="h-3.5 w-3.5 shrink-0" />
          <span className="[[data-layout-tier=medium]_&]:hidden [[data-layout-tier=narrow]_&]:hidden [[data-layout-tier=tight]_&]:hidden">Súbor</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        <DropdownMenuItem onClick={onImport}>
          <FolderInput className="h-3.5 w-3.5 shrink-0" />
          Importovať…
        </DropdownMenuItem>
        {hasDocument && hasFilePath && onRevealFile && (
          <DropdownMenuItem onClick={onRevealFile}>
            <FileSymlink className="h-3.5 w-3.5 shrink-0" />
            Zobraziť v Finderi
          </DropdownMenuItem>
        )}
        {hasDocument && onSaveAsTemplate && (
          <DropdownMenuItem onClick={onSaveAsTemplate}>
            <LayoutTemplate className="h-3.5 w-3.5 shrink-0" />
            Uložiť ako šablónu…
          </DropdownMenuItem>
        )}
        {hasDocument && onPdfPreview && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onPdfPreview}>
              <Eye className="h-3.5 w-3.5 shrink-0" />
              Náhľad PDF
            </DropdownMenuItem>
          </>
        )}
        {hasDocument && onPrint && (
          <DropdownMenuItem onClick={onPrint}>
            <Printer className="h-3.5 w-3.5 shrink-0" />
            Tlačiť…
          </DropdownMenuItem>
        )}
        {hasDocument && onExport && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onExport('pdf')}>Exportovať PDF</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('docx')}>Word (DOCX)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('md')}>Markdown (MD)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('txt')}>Text (TXT)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('pages')}>Apple Pages</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
