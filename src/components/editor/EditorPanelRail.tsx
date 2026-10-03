import type { ReactNode } from 'react'
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  Focus,
  History,
  Layers,
  Link2,
  ListTree,
  MessageSquare,
  MoreVertical,
  PanelLeft,
  PanelRightClose,
  Search,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AgentBlobatar, AGENT_BLOBATAR_NAME } from '@/components/agent/AgentBlobatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { SPELLCHECK_AGENT_BLOBATAR_NAME } from '@/lib/library/spellcheck-agent'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  openAgentPanel,
  setAgentPanelOpen,
  setBacklinksPanelOpen,
  setClipboardHistoryPanelOpen,
  setCommentsPanelOpen,
  setDocumentOutlineOpen,
  setFindReplaceMode,
  setFlashcardsPanelOpen,
  setInsightsPanelOpen,
  setPanelRailExpanded,
  setRevisionHistoryOpen,
  setStatsPanelOpen,
  toggleDocumentTocLeftOpen,
  toggleFindReplaceOpen,
  toggleFocusMode,
  toggleReadingMode,
} from '@/store/documentsSlice'

type RailButtonProps = {
  active?: boolean
  label: string
  onClick: () => void
  children: ReactNode
  tourId?: string
  className?: string
}

function RailButton({ active, label, onClick, children, tourId, className }: RailButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn('editor-panel-rail-btn titlebar-no-drag', active && 'is-active', className)}
          aria-label={label}
          aria-pressed={active}
          data-tour={tourId}
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
  const tocLeftOpen = useAppSelector((state) => state.documents.documentTocLeftOpen)
  const historyOpen = useAppSelector((state) => state.documents.revisionHistoryOpen)
  const commentsOpen = useAppSelector((state) => state.documents.commentsPanelOpen)
  const statsOpen = useAppSelector((state) => state.documents.statsPanelOpen)
  const backlinksOpen = useAppSelector((state) => state.documents.backlinksPanelOpen)
  const insightsOpen = useAppSelector((state) => state.documents.insightsPanelOpen)
  const agentOpen = useAppSelector((state) => state.documents.agentPanelOpen)
  const agentPersona = useAppSelector((state) => state.documents.agentPersona)
  const generalAgentOpen = agentOpen && agentPersona === 'general'
  const spellAgentOpen = agentOpen && agentPersona === 'spellcheck'
  const clipboardOpen = useAppSelector((state) => state.documents.clipboardHistoryPanelOpen)
  const flashcardsOpen = useAppSelector((state) => state.documents.flashcardsPanelOpen)
  const findReplaceOpen = useAppSelector((state) => state.documents.findReplaceOpen)
  const panelRailExpanded = useAppSelector((state) => state.documents.panelRailExpanded)
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const readingMode = useAppSelector((state) => state.documents.readingMode)
  const dispatch = useAppDispatch()
  const { t } = useTranslation()

  const anyPanelOpen =
    outlineOpen ||
    historyOpen ||
    commentsOpen ||
    statsOpen ||
    backlinksOpen ||
    insightsOpen ||
    agentOpen ||
    clipboardOpen ||
    flashcardsOpen ||
    findReplaceOpen
  const expanded = panelRailExpanded || anyPanelOpen

  function closeOtherPanels(
    except?:
      | 'outline'
      | 'history'
      | 'comments'
      | 'stats'
      | 'backlinks'
      | 'insights'
      | 'agent'
      | 'clipboard'
      | 'flashcards',
  ) {
    if (except !== 'outline') dispatch(setDocumentOutlineOpen(false))
    if (except !== 'history') dispatch(setRevisionHistoryOpen(false))
    if (except !== 'comments') dispatch(setCommentsPanelOpen(false))
    if (except !== 'stats') dispatch(setStatsPanelOpen(false))
    if (except !== 'backlinks') dispatch(setBacklinksPanelOpen(false))
    if (except !== 'insights') dispatch(setInsightsPanelOpen(false))
    if (except !== 'agent') dispatch(setAgentPanelOpen(false))
    if (except !== 'clipboard') dispatch(setClipboardHistoryPanelOpen(false))
    if (except !== 'flashcards') dispatch(setFlashcardsPanelOpen(false))
  }

  function openFind() {
    if (!findReplaceOpen) {
      dispatch(setFindReplaceMode('find'))
    }
    dispatch(toggleFindReplaceOpen())
  }

  function openOutline() {
    closeOtherPanels('outline')
    dispatch(setDocumentOutlineOpen(!outlineOpen))
  }

  function openInsights() {
    closeOtherPanels('insights')
    dispatch(setInsightsPanelOpen(!insightsOpen))
  }

  function openAgent() {
    closeOtherPanels('agent')
    if (generalAgentOpen) dispatch(setAgentPanelOpen(false))
    else dispatch(openAgentPanel({ persona: 'general' }))
  }

  function openSpellAgent() {
    closeOtherPanels('agent')
    if (spellAgentOpen) dispatch(setAgentPanelOpen(false))
    else dispatch(openAgentPanel({ persona: 'spellcheck' }))
  }

  const agentButton = (
    <RailButton
      label={t('editorPanels.agent')}
      active={generalAgentOpen}
      tourId="panel-agent"
      className="editor-panel-rail-btn--agent"
      onClick={openAgent}
    >
      <AgentBlobatar
        name={AGENT_BLOBATAR_NAME}
        size={22}
        talking={generalAgentOpen}
        title={t('agent.faceTitle')}
      />
    </RailButton>
  )

  const spellAgentButton = (
    <RailButton
      label={t('editorPanels.spellcheckAgent')}
      active={spellAgentOpen}
      tourId="panel-spellcheck-agent"
      className="editor-panel-rail-btn--spellcheck-agent"
      onClick={openSpellAgent}
    >
      <AgentBlobatar
        name={SPELLCHECK_AGENT_BLOBATAR_NAME}
        size={22}
        talking={spellAgentOpen}
        title={t('agent.spellAgent.faceTitle')}
      />
    </RailButton>
  )

  if (!expanded) {
    return (
      <TooltipProvider>
        <div
          className="editor-panel-rail editor-panel-rail--collapsed titlebar-no-drag"
          aria-label={t('editorPanels.ariaLabel')}
        >
          {agentButton}
          {spellAgentButton}
          <RailButton
            label={findReplaceOpen ? t('editorPanels.findReplaceClose') : t('editorPanels.findReplace')}
            active={findReplaceOpen}
            onClick={openFind}
          >
            <Search className="h-4 w-4" />
          </RailButton>
          <RailButton
            label={t('editorPanels.outline')}
            active={outlineOpen}
            tourId="panel-outline"
            onClick={openOutline}
          >
            <ListTree className="h-4 w-4" />
          </RailButton>
          <RailButton
            label={t('editorPanels.insights')}
            active={insightsOpen}
            tourId="panel-insights"
            onClick={openInsights}
          >
            <Sparkles className="h-4 w-4" />
          </RailButton>
          <div className="editor-panel-rail-sep" aria-hidden="true" />
          <RailButton
            label={t('editorPanels.expand')}
            onClick={() => dispatch(setPanelRailExpanded(true))}
          >
            <MoreVertical className="h-4 w-4" />
          </RailButton>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <div className="editor-panel-rail titlebar-no-drag" aria-label={t('editorPanels.ariaLabel')} data-tour="panel-rail">
        <RailButton
          label={t('editorPanels.collapse')}
          onClick={() => {
            closeOtherPanels()
            if (findReplaceOpen) dispatch(toggleFindReplaceOpen())
            dispatch(setPanelRailExpanded(false))
          }}
        >
          <PanelRightClose className="h-4 w-4" />
        </RailButton>

        <div className="editor-panel-rail-sep" aria-hidden="true" />

        {agentButton}
        {spellAgentButton}

        <div className="editor-panel-rail-sep" aria-hidden="true" />

        <RailButton
          label={tocLeftOpen ? t('editorPanels.leftOutlineOff') : t('editorPanels.leftOutline')}
          active={tocLeftOpen}
          onClick={() => dispatch(toggleDocumentTocLeftOpen())}
        >
          <PanelLeft className="h-4 w-4" />
        </RailButton>
        <RailButton
          label={t('editorPanels.outline')}
          active={outlineOpen}
          tourId="panel-outline"
          onClick={openOutline}
        >
          <ListTree className="h-4 w-4" />
        </RailButton>
        <RailButton
          label={t('editorPanels.comments')}
          active={commentsOpen}
          onClick={() => {
            closeOtherPanels('comments')
            dispatch(setCommentsPanelOpen(!commentsOpen))
          }}
        >
          <MessageSquare className="h-4 w-4" />
        </RailButton>
        <RailButton
          label={t('editorPanels.backlinks')}
          active={backlinksOpen}
          onClick={() => {
            closeOtherPanels('backlinks')
            dispatch(setBacklinksPanelOpen(!backlinksOpen))
          }}
        >
          <Link2 className="h-4 w-4" />
        </RailButton>
        <RailButton
          label={t('editorPanels.insights')}
          active={insightsOpen}
          tourId="panel-insights"
          onClick={openInsights}
        >
          <Sparkles className="h-4 w-4" />
        </RailButton>
        <RailButton
          label={t('editorPanels.flashcards')}
          active={flashcardsOpen}
          onClick={() => {
            closeOtherPanels('flashcards')
            dispatch(setFlashcardsPanelOpen(!flashcardsOpen))
          }}
        >
          <Layers className="h-4 w-4" />
        </RailButton>
        <RailButton
          label={t('editorPanels.clipboard')}
          active={clipboardOpen}
          onClick={() => {
            closeOtherPanels('clipboard')
            dispatch(setClipboardHistoryPanelOpen(!clipboardOpen))
          }}
        >
          <ClipboardList className="h-4 w-4" />
        </RailButton>
        <RailButton
          label={t('editorPanels.stats')}
          active={statsOpen}
          onClick={() => {
            closeOtherPanels('stats')
            dispatch(setStatsPanelOpen(!statsOpen))
          }}
        >
          <BarChart3 className="h-4 w-4" />
        </RailButton>
        <RailButton
          label={t('editorPanels.revisions')}
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
          label={findReplaceOpen ? t('editorPanels.findReplaceClose') : t('editorPanels.findReplace')}
          active={findReplaceOpen}
          onClick={openFind}
        >
          <Search className="h-4 w-4" />
        </RailButton>
        <RailButton
          label={focusMode ? t('shortcuts.focusMode.labelOff') : t('shortcuts.focusMode.label')}
          active={focusMode}
          onClick={() => dispatch(toggleFocusMode())}
        >
          <Focus className="h-4 w-4" />
        </RailButton>
        <RailButton
          label={readingMode ? t('shortcuts.readingMode.labelOff') : t('shortcuts.readingMode.label')}
          active={readingMode}
          onClick={() => dispatch(toggleReadingMode())}
        >
          <BookOpen className="h-4 w-4" />
        </RailButton>
      </div>
    </TooltipProvider>
  )
}
