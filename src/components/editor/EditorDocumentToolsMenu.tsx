import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, FileText, FolderInput, SlidersHorizontal } from 'lucide-react'
import { PageSetupDialog } from '@/components/editor/PageSetupDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAppDispatch } from '@/store/hooks'
import { setMoveDocumentPickerOpen } from '@/store/foldersSlice'

type EditorDocumentToolsMenuProps = {
  viewMode: 'rich' | 'markdown'
}

export function EditorDocumentToolsMenu({ viewMode }: EditorDocumentToolsMenuProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const [pageSetupOpen, setPageSetupOpen] = useState(false)

  if (viewMode !== 'rich') return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="editor-tools-trigger"
            title={t('printLayout.moreActions')}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
            <span className="[[data-layout-tier=medium]_&]:hidden [[data-layout-tier=narrow]_&]:hidden [[data-layout-tier=tight]_&]:hidden">
              {t('printLayout.more')}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          <DropdownMenuItem onClick={() => setPageSetupOpen(true)}>
            <FileText className="h-4 w-4 shrink-0" />
            {t('printLayout.pageSetup')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => dispatch(setMoveDocumentPickerOpen(true))}>
            <FolderInput className="h-4 w-4 shrink-0" />
            {t('printLayout.moveToFolder')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <PageSetupDialog open={pageSetupOpen} onClose={() => setPageSetupOpen(false)} />
    </>
  )
}
