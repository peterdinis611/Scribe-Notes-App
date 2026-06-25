import { useAtom, useSetAtom } from 'jotai'
import { ChevronDown, Focus, FolderInput, History, ListTree, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  documentOutlineOpenAtom,
  focusModeAtom,
  revisionHistoryOpenAtom,
} from '@/store/documents'
import { moveDocumentPickerOpenAtom } from '@/store/folders'

type EditorDocumentToolsMenuProps = {
  viewMode: 'rich' | 'markdown'
}

export function EditorDocumentToolsMenu({ viewMode }: EditorDocumentToolsMenuProps) {
  const [outlineOpen, setOutlineOpen] = useAtom(documentOutlineOpenAtom)
  const [historyOpen, setHistoryOpen] = useAtom(revisionHistoryOpenAtom)
  const [focusMode, setFocusMode] = useAtom(focusModeAtom)
  const setMovePickerOpen = useSetAtom(moveDocumentPickerOpenAtom)

  if (viewMode !== 'rich') return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={outlineOpen || historyOpen || focusMode ? 'default' : 'ghost'}
          size="sm"
          className="editor-tools-trigger"
          title="Nástroje dokumentu"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          <span className="editor-header-label">Nástroje</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuItem
          className={cn(outlineOpen && 'is-selected')}
          onClick={() => {
            setHistoryOpen(false)
            setOutlineOpen((open) => !open)
          }}
        >
          <ListTree className="h-4 w-4 shrink-0" />
          Štruktúra dokumentu
        </DropdownMenuItem>
        <DropdownMenuItem
          className={cn(historyOpen && 'is-selected')}
          onClick={() => {
            setOutlineOpen(false)
            setHistoryOpen((open) => !open)
          }}
        >
          <History className="h-4 w-4 shrink-0" />
          História verzií
        </DropdownMenuItem>
        <DropdownMenuItem
          className={cn(focusMode && 'is-selected')}
          onClick={() => setFocusMode((open) => !open)}
        >
          <Focus className="h-4 w-4 shrink-0" />
          Režim sústredenia
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setMovePickerOpen(true)}>
          <FolderInput className="h-4 w-4 shrink-0" />
          Presunúť do priečinka
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
