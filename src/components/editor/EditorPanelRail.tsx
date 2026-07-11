import type { ReactNode } from 'react'
import {
  BarChart3,
  Focus,
  History,
  Link2,
  ListTree,
  MessageSquare,
  Search,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setBacklinksPanelOpen,
  setCommentsPanelOpen,
  setDocumentOutlineOpen,
  setFindReplaceMode,
  setFindReplaceOpen,
  setRevisionHistoryOpen,
  setStatsPanelOpen,
  toggleFocusMode,
} from '@/store/documentsSlice'

type RailButtonProps = {
  active?: boolean
  label: string
  onClick: () => void
  children: ReactNode
}

function RailButton({ active, label, onClick, children }: RailButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn('editor-panel-rail-btn titlebar-no-drag', active && 'is-active')}
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}

export function EditorPanelRail() {
  const outlineOpen = useAppSelector((state) => state.documents.documentOutlineOpen)
  const historyOpen = useAppSelector((state) => state.documents.revisionHistoryOpen)
  const commentsOpen = useAppSelector((state) => state.documents.commentsPanelOpen)
  const statsOpen = useAppSelector((state) => state.documents.statsPanelOpen)
  const backlinksOpen = useAppSelector((state) => state.documents.backlinksPanelOpen)
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const dispatch = useAppDispatch()

  function closeOtherPanels(except?: 'outline' | 'history' | 'comments' | 'stats' | 'backlinks') {
    if (except !== 'outline') dispatch(setDocumentOutlineOpen(false))
    if (except !== 'history') dispatch(setRevisionHistoryOpen(false))
    if (except !== 'comments') dispatch(setCommentsPanelOpen(false))
    if (except !== 'stats') dispatch(setStatsPanelOpen(false))
    if (except !== 'backlinks') dispatch(setBacklinksPanelOpen(false))
  }

  return (
    <TooltipProvider>
      <div className="editor-panel-rail titlebar-no-drag" aria-label="Panely dokumentu">
        <RailButton
          label="Štruktúra dokumentu"
          active={outlineOpen}
          onClick={() => {
            closeOtherPanels('outline')
            dispatch(setDocumentOutlineOpen(!outlineOpen))
          }}
        >
          <ListTree className="h-4 w-4" />
        </RailButton>
        <RailButton
          label="Komentáre"
          active={commentsOpen}
          onClick={() => {
            closeOtherPanels('comments')
            dispatch(setCommentsPanelOpen(!commentsOpen))
          }}
        >
          <MessageSquare className="h-4 w-4" />
        </RailButton>
        <RailButton
          label="Odkazy sem"
          active={backlinksOpen}
          onClick={() => {
            closeOtherPanels('backlinks')
            dispatch(setBacklinksPanelOpen(!backlinksOpen))
          }}
        >
          <Link2 className="h-4 w-4" />
        </RailButton>
        <RailButton
          label="Štatistika"
          active={statsOpen}
          onClick={() => {
            closeOtherPanels('stats')
            dispatch(setStatsPanelOpen(!statsOpen))
          }}
        >
          <BarChart3 className="h-4 w-4" />
        </RailButton>
        <RailButton
          label="História verzií"
          active={historyOpen}
          onClick={() => {
            closeOtherPanels('history')
            dispatch(setRevisionHistoryOpen(!historyOpen))
          }}
        >
          <History className="h-4 w-4" />
        </RailButton>

        <div className="editor-panel-rail-sep" aria-hidden="true" />

        <RailButton
          label="Nájsť a nahradiť"
          onClick={() => {
            dispatch(setFindReplaceMode('find'))
            dispatch(setFindReplaceOpen(true))
          }}
        >
          <Search className="h-4 w-4" />
        </RailButton>
        <RailButton
          label={focusMode ? 'Vypnúť režim sústredenia' : 'Režim sústredenia'}
          active={focusMode}
          onClick={() => dispatch(toggleFocusMode())}
        >
          <Focus className="h-4 w-4" />
        </RailButton>
      </div>
    </TooltipProvider>
  )
}
