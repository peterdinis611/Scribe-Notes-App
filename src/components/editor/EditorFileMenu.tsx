import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ChevronDown, Eye, FileDown, FileSymlink, FolderInput, Printer } from 'lucide-react'

type EditorFileMenuProps = {
  hasFilePath: boolean
  onImport: () => void
  onRevealFile: () => void
  onPdfPreview: () => void
  onPrint?: () => void
  onExport: (format: 'pdf' | 'docx' | 'txt' | 'pages' | 'md') => void
}

export function EditorFileMenu({
  hasFilePath,
  onImport,
  onRevealFile,
  onPdfPreview,
  onPrint,
  onExport,
}: EditorFileMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="editor-file-menu-trigger">
          <FileDown className="h-3.5 w-3.5 shrink-0" />
          <span className="editor-header-label">Súbor</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        <DropdownMenuItem onClick={onImport}>
          <FolderInput className="h-3.5 w-3.5 shrink-0" />
          Importovať…
        </DropdownMenuItem>
        {hasFilePath && (
          <DropdownMenuItem onClick={onRevealFile}>
            <FileSymlink className="h-3.5 w-3.5 shrink-0" />
            Zobraziť v Finderi
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onPdfPreview}>
          <Eye className="h-3.5 w-3.5 shrink-0" />
          Náhľad PDF
        </DropdownMenuItem>
        {onPrint && (
          <DropdownMenuItem onClick={onPrint}>
            <Printer className="h-3.5 w-3.5 shrink-0" />
            Tlačiť…
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onExport('pdf')}>Exportovať PDF</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('docx')}>Word (DOCX)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('md')}>Markdown (MD)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('txt')}>Text (TXT)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('pages')}>Apple Pages</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
