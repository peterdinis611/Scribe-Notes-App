import { useAtom, useSetAtom } from 'jotai'
import { useState } from 'react'
import {
  BarChart3,
  ChevronDown,
  FileText,
  Focus,
  FolderInput,
  History,
  Link2,
  ListTree,
  MessageSquare,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { PageSetupDialog } from '@/components/editor/PageSetupDialog'
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
  backlinksPanelOpenAtom,
  commentsPanelOpenAtom,
  documentOutlineOpenAtom,
  findReplaceModeAtom,
  findReplaceOpenAtom,
  focusModeAtom,
  revisionHistoryOpenAtom,
  statsPanelOpenAtom,
} from '@/store/documents'
import { moveDocumentPickerOpenAtom } from '@/store/folders'

type EditorDocumentToolsMenuProps = {
  viewMode: 'rich' | 'markdown'
}

export function EditorDocumentToolsMenu({ viewMode }: EditorDocumentToolsMenuProps) {
  const [outlineOpen, setOutlineOpen] = useAtom(documentOutlineOpenAtom)
  const [historyOpen, setHistoryOpen] = useAtom(revisionHistoryOpenAtom)
  const [commentsOpen, setCommentsOpen] = useAtom(commentsPanelOpenAtom)
  const [statsOpen, setStatsOpen] = useAtom(statsPanelOpenAtom)
  const [backlinksOpen, setBacklinksOpen] = useAtom(backlinksPanelOpenAtom)
  const [focusMode, setFocusMode] = useAtom(focusModeAtom)
  const setMovePickerOpen = useSetAtom(moveDocumentPickerOpenAtom)
  const setFindReplaceOpen = useSetAtom(findReplaceOpenAtom)
  const setFindReplaceMode = useSetAtom(findReplaceModeAtom)
  const [pageSetupOpen, setPageSetupOpen] = useState(false)

  if (viewMode !== 'rich') return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={
              outlineOpen || historyOpen || commentsOpen || statsOpen || backlinksOpen || focusMode
                ? 'default'
                : 'ghost'
            }
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
            onClick={() => {
              setFindReplaceMode('find')
              setFindReplaceOpen(true)
            }}
          >
            <Search className="h-4 w-4 shrink-0" />
            Nájsť a nahradiť
            <span className="ml-auto text-[11px] text-[var(--color-muted-foreground)]">⌘F</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={cn(commentsOpen && 'is-selected')}
            onClick={() => {
              setStatsOpen(false)
              setBacklinksOpen(false)
              setCommentsOpen((open) => !open)
            }}
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            Komentáre
          </DropdownMenuItem>
          <DropdownMenuItem
            className={cn(backlinksOpen && 'is-selected')}
            onClick={() => {
              setCommentsOpen(false)
              setStatsOpen(false)
              setBacklinksOpen((open) => !open)
            }}
          >
            <Link2 className="h-4 w-4 shrink-0" />
            Odkazy sem
          </DropdownMenuItem>
          <DropdownMenuItem
            className={cn(statsOpen && 'is-selected')}
            onClick={() => {
              setCommentsOpen(false)
              setBacklinksOpen(false)
              setStatsOpen((open) => !open)
            }}
          >
            <BarChart3 className="h-4 w-4 shrink-0" />
            Štatistika
          </DropdownMenuItem>
          <DropdownMenuSeparator />
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
            {focusMode ? 'Vypnúť režim sústredenia' : 'Režim sústredenia'}
            <span className="ml-auto text-[11px] text-[var(--color-muted-foreground)]">⌘⇧F</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setPageSetupOpen(true)}>
            <FileText className="h-4 w-4 shrink-0" />
            Nastavenie stránky
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMovePickerOpen(true)}>
            <FolderInput className="h-4 w-4 shrink-0" />
            Presunúť do priečinka
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <PageSetupDialog open={pageSetupOpen} onClose={() => setPageSetupOpen(false)} />
    </>
  )
}
