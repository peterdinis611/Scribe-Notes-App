import type { ReactNode } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import {
  BarChart3,
  Focus,
  History,
  Link2,
  ListTree,
  MessageSquare,
  Search,
} from 'lucide-react'
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

type RailButtonProps = {
  active?: boolean
  label: string
  onClick: () => void
  children: ReactNode
}

function RailButton({ active, label, onClick, children }: RailButtonProps) {
  return (
    <button
      type="button"
      className={cn('editor-panel-rail-btn titlebar-no-drag', active && 'is-active')}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function EditorPanelRail() {
  const [outlineOpen, setOutlineOpen] = useAtom(documentOutlineOpenAtom)
  const [historyOpen, setHistoryOpen] = useAtom(revisionHistoryOpenAtom)
  const [commentsOpen, setCommentsOpen] = useAtom(commentsPanelOpenAtom)
  const [statsOpen, setStatsOpen] = useAtom(statsPanelOpenAtom)
  const [backlinksOpen, setBacklinksOpen] = useAtom(backlinksPanelOpenAtom)
  const [focusMode, setFocusMode] = useAtom(focusModeAtom)
  const setFindReplaceOpen = useSetAtom(findReplaceOpenAtom)
  const setFindReplaceMode = useSetAtom(findReplaceModeAtom)

  function closeOtherPanels(except?: 'outline' | 'history' | 'comments' | 'stats' | 'backlinks') {
    if (except !== 'outline') setOutlineOpen(false)
    if (except !== 'history') setHistoryOpen(false)
    if (except !== 'comments') setCommentsOpen(false)
    if (except !== 'stats') setStatsOpen(false)
    if (except !== 'backlinks') setBacklinksOpen(false)
  }

  return (
    <div className="editor-panel-rail titlebar-no-drag" aria-label="Panely dokumentu">
      <RailButton
        label="Štruktúra dokumentu"
        active={outlineOpen}
        onClick={() => {
          closeOtherPanels('outline')
          setOutlineOpen((open) => !open)
        }}
      >
        <ListTree className="h-4 w-4" />
      </RailButton>
      <RailButton
        label="Komentáre"
        active={commentsOpen}
        onClick={() => {
          closeOtherPanels('comments')
          setCommentsOpen((open) => !open)
        }}
      >
        <MessageSquare className="h-4 w-4" />
      </RailButton>
      <RailButton
        label="Odkazy sem"
        active={backlinksOpen}
        onClick={() => {
          closeOtherPanels('backlinks')
          setBacklinksOpen((open) => !open)
        }}
      >
        <Link2 className="h-4 w-4" />
      </RailButton>
      <RailButton
        label="Štatistika"
        active={statsOpen}
        onClick={() => {
          closeOtherPanels('stats')
          setStatsOpen((open) => !open)
        }}
      >
        <BarChart3 className="h-4 w-4" />
      </RailButton>
      <RailButton
        label="História verzií"
        active={historyOpen}
        onClick={() => {
          closeOtherPanels('history')
          setHistoryOpen((open) => !open)
        }}
      >
        <History className="h-4 w-4" />
      </RailButton>

      <div className="editor-panel-rail-sep" aria-hidden="true" />

      <RailButton
        label="Nájsť a nahradiť"
        onClick={() => {
          setFindReplaceMode('find')
          setFindReplaceOpen(true)
        }}
      >
        <Search className="h-4 w-4" />
      </RailButton>
      <RailButton
        label={focusMode ? 'Vypnúť režim sústredenia' : 'Režim sústredenia'}
        active={focusMode}
        onClick={() => setFocusMode((open) => !open)}
      >
        <Focus className="h-4 w-4" />
      </RailButton>
    </div>
  )
}
