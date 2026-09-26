import { Bot, Eraser, FilePlus2, FileText, GraduationCap, Library, Send, Settings2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { MarkdownView } from '@/components/MarkdownView'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
} from '@/components/ui/message'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import {
  appendAgentMessage,
  appendAgentRun,
  clearAgentMessages,
  listAgentMessages,
  type AgentMessageStep,
  type DocumentChatCitation,
} from '@/lib/db/api'
import { nlpDocumentAnalysis, nlpDocumentTasks, nlpStatus, type DocumentTask, type NlpDocumentAnalysis } from '@/lib/db/nlp-api'
import { insertAiAnswerAsCallout } from '@/lib/editor/insert-ai-answer'
import {
  agentMemoryContext,
  runAgentGoal,
  type AgentStep,
  type AgentToolId,
} from '@/lib/library/agent'
import { AGENT_RECIPES, type AgentRecipeId } from '@/lib/library/agent-recipes'
import {
  buildAgentGoalChips,
  buildAgentToolOptions,
  LIBRARY_AGENT_STARTER_CHIPS,
} from '@/lib/library/agent-suggestions'
import { AGENT_TEACHING_MAX_LEN } from '@/lib/library/agent-prefs'
import type { ChatScope, LibraryChatCitation } from '@/lib/library/library-chat'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { citationSearchQuery } from '@/lib/editor/citation-jump'
import { setActiveDocument, setActiveDocumentId, setPendingEditorSearch } from '@/store/documentsSlice'
import { addAgentTeaching, removeAgentTeaching, setAgentPrefs } from '@/store/settingsSlice'

type AgentThreadMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  citations?: LibraryChatCitation[]
  steps?: AgentStep[]
  followups?: string[]
  clarifyOptions?: AgentToolId[]
  createdAt?: number
}

type AgentPanelProps = {
  onNavigate?: () => void
}

const TOOL_LABEL_KEYS: Record<AgentToolId, string> = {
  library_answer: 'agent.tools.library_answer',
  document_answer: 'agent.tools.document_answer',
  summarize: 'agent.tools.summarize',
  outline: 'agent.tools.outline',
  tasks: 'agent.tools.tasks',
  similar: 'agent.tools.similar',
  style: 'agent.tools.style',
  flashcards: 'agent.tools.flashcards',
  takeaways: 'agent.tools.takeaways',
  dates: 'agent.tools.dates',
  meeting: 'agent.tools.meeting',
  terminology: 'agent.tools.terminology',
  wiki: 'agent.tools.wiki',
  organize: 'agent.tools.organize',
  duplicates: 'agent.tools.duplicates',
  citations: 'agent.tools.citations',
  quiz: 'agent.tools.quiz',
  revision: 'agent.tools.revision',
  spellcheck: 'agent.tools.spellcheck',
  rewrite: 'agent.tools.rewrite',
}


function stepsFromRecord(steps: AgentMessageStep[] | undefined): AgentStep[] {
  return (steps ?? []).map((step) => ({
    tool: step.tool as AgentToolId,
    status: (step.status as AgentStep['status']) || 'ok',
    detail: step.detail ?? undefined,
  }))
}

function toPersistSteps(steps: AgentStep[]): AgentMessageStep[] {
  return steps.map((step) => ({
    tool: step.tool,
    status: step.status,
    detail: step.detail ?? null,
  }))
}

function toPersistCitations(citations: LibraryChatCitation[]): DocumentChatCitation[] {
  return citations.map((item) => ({
    documentId: item.documentId,
    title: item.title,
    snippet: item.snippet,
  }))
}

export function AgentPanel({ onNavigate }: AgentPanelProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const activeDocumentId = useAppSelector((state) => state.documents.activeDocumentId)
  const commentAuthor = useAppSelector((state) => state.documents.commentAuthor)
  const agentPrefs = useAppSelector((state) => state.settings.agentPrefs)
  const activeDocument = activeDocumentId ? peekCachedDocument(activeDocumentId) : null

  const [scope, setScope] = useState<ChatScope>('library')
  const [input, setInput] = useState('')
  const [teachInput, setTeachInput] = useState('')
  const [showTeach, setShowTeach] = useState(false)
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [messages, setMessages] = useState<AgentThreadMessage[]>([])
  const [sessionMessages, setSessionMessages] = useState<AgentThreadMessage[]>([])
  const [analysis, setAnalysis] = useState<NlpDocumentAnalysis | null>(null)
  const [tasks, setTasks] = useState<DocumentTask[] | null>(null)
  const [nlpReady, setNlpReady] = useState<boolean | null>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const slovak = i18n.language?.toLowerCase().startsWith('sk')

  const displayMessages = scope === 'document' ? messages : sessionMessages

  useEffect(() => {
    void nlpStatus()
      .then((status) => setNlpReady(Boolean(status.enabled && status.sidecarOk)))
      .catch(() => setNlpReady(false))
  }, [])

  useEffect(() => {
    if (scope !== 'document' || !activeDocumentId) {
      setMessages([])
      return
    }
    let cancelled = false
    setHistoryLoading(true)
    void listAgentMessages(activeDocumentId)
      .then((rows) => {
        if (cancelled) return
        setMessages(
          rows.map((row) => ({
            id: row.id,
            role: row.role === 'assistant' ? 'assistant' : 'user',
            text: row.text,
            citations: row.citations,
            steps: stepsFromRecord(row.steps),
            createdAt: row.createdAt,
          })),
        )
      })
      .catch(() => {
        if (!cancelled) setMessages([])
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [scope, activeDocumentId])

  useEffect(() => {
    if (scope !== 'document' || !activeDocumentId) {
      setAnalysis(null)
      setTasks(null)
      return
    }
    let cancelled = false
    void Promise.all([
      nlpDocumentAnalysis(activeDocumentId).catch(() => null),
      nlpDocumentTasks(activeDocumentId).catch(() => [] as DocumentTask[]),
    ]).then(([nextAnalysis, nextTasks]) => {
      if (cancelled) return
      setAnalysis(nextAnalysis)
      setTasks(nextTasks)
    })
    return () => {
      cancelled = true
    }
  }, [scope, activeDocumentId])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' })
  }, [displayMessages, loading])

  const goalChips = useMemo(() => {
    if (scope === 'document' && activeDocumentId) {
      return buildAgentGoalChips(analysis, tasks, {
        title: activeDocument?.title,
        slovak,
      })
    }
    return LIBRARY_AGENT_STARTER_CHIPS.map((key) => t(key))
  }, [scope, activeDocumentId, analysis, tasks, activeDocument?.title, slovak, t])

  const toolOptions = useMemo(() => {
    if (scope !== 'document' || !activeDocumentId) return [] as AgentToolId[]
    return buildAgentToolOptions(analysis, tasks)
  }, [scope, activeDocumentId, analysis, tasks])

  const changeScope = useCallback(
    (next: ChatScope) => {
      if (next === 'document' && !activeDocumentId) return
      setScope(next)
    },
    [activeDocumentId],
  )

  const clearMemory = useCallback(async () => {
    if (scope === 'library') {
      setSessionMessages([])
      return
    }
    if (!activeDocumentId) return
    try {
      await clearAgentMessages(activeDocumentId)
      setMessages([])
      toast.success(t('agent.memoryCleared'))
    } catch (error) {
      toast.error(t('agent.clearError'), String(error))
    }
  }, [scope, activeDocumentId, t])

  const persistPair = useCallback(
    async (userText: string, assistant: AgentThreadMessage) => {
      if (scope !== 'document' || !activeDocumentId) return
      try {
        await appendAgentMessage({
          documentId: activeDocumentId,
          role: 'user',
          text: userText,
        })
        await appendAgentMessage({
          documentId: activeDocumentId,
          role: 'assistant',
          text: assistant.text,
          steps: toPersistSteps(assistant.steps ?? []),
          citations: toPersistCitations(assistant.citations ?? []),
        })
      } catch {
        // Soft-fail persistence — answer still shown in UI.
      }
    },
    [scope, activeDocumentId],
  )

  const runGoal = useCallback(
    async (
      goal: string,
      opts?: { recipeId?: AgentRecipeId; forceTools?: AgentToolId[] },
    ) => {
      const trimmed = goal.trim()
      if ((!trimmed && !opts?.recipeId && !opts?.forceTools?.length) || loading) return
      if (!agentPrefs.enabled) {
        toast.error(t('agent.errorTitle'), t('agent.disabled'))
        return
      }
      if (scope === 'document' && !activeDocumentId) {
        toast.error(t('libraryChat.noActiveDocument'))
        return
      }

      const recipe = opts?.recipeId ? AGENT_RECIPES.find((item) => item.id === opts.recipeId) : null
      const displayGoal =
        trimmed ||
        (recipe ? t(recipe.labelKey) : t('agent.run'))
      const userMsg: AgentThreadMessage = {
        id: `local-user-${Date.now()}`,
        role: 'user',
        text: displayGoal,
        createdAt: Date.now(),
      }
      const prior = scope === 'document' ? messages : sessionMessages
      if (scope === 'document') {
        setMessages((prev) => [...prev, userMsg])
      } else {
        setSessionMessages((prev) => [...prev, userMsg])
      }
      setInput('')
      setLoading(true)

      try {
        const result = await runAgentGoal(
          trimmed || displayGoal,
          scope,
          activeDocumentId,
          agentMemoryContext(prior),
          agentPrefs,
          opts,
        )

        if (result.nextPrefs) {
          dispatch(setAgentPrefs(result.nextPrefs))
        }

        if (result.needsClarification) {
          const assistant: AgentThreadMessage = {
            id: `local-assistant-${Date.now()}`,
            role: 'assistant',
            text: t('agent.clarifyPrompt'),
            clarifyOptions: result.clarifyOptions,
            createdAt: Date.now(),
          }
          if (scope === 'document') {
            setMessages((prev) => [...prev, assistant])
          } else {
            setSessionMessages((prev) => [...prev, assistant])
          }
          return
        }

        const assistant: AgentThreadMessage = {
          id: `local-assistant-${Date.now()}`,
          role: 'assistant',
          text: result.answer || t('agent.emptyResult'),
          citations: result.citations,
          steps: result.steps,
          followups: result.followups,
          createdAt: Date.now(),
        }
        if (scope === 'document') {
          setMessages((prev) => [...prev, assistant])
          await persistPair(trimmed || displayGoal, assistant)
        } else {
          setSessionMessages((prev) => [...prev, assistant])
        }
        void appendAgentRun({
          scope,
          documentId: activeDocumentId,
          goal: trimmed || displayGoal,
          stepsJson: JSON.stringify(toPersistSteps(assistant.steps ?? [])),
          answer: assistant.text,
        }).catch(() => undefined)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const key = message.startsWith('libraryChat.') || message.startsWith('agent.') ? message : null
        toast.error(t('agent.errorTitle'), key ? t(key) : message)
      } finally {
        setLoading(false)
      }
    },
    [loading, agentPrefs, scope, activeDocumentId, messages, sessionMessages, persistPair, t, dispatch],
  )

  const applyAnswerToNote = useCallback(
    (text: string) => {
      if (!activeDocumentId) {
        toast.error(t('libraryChat.noActiveDocument'))
        return
      }
      const ok = insertAiAnswerAsCallout(text, { sourceTitle: t('agent.brandBadge') })
      if (ok) toast.success(t('agent.appliedToNote'))
      else toast.error(t('agent.applyFailed'))
    },
    [activeDocumentId, t],
  )

  const handleTeach = useCallback(() => {
    const text = teachInput.trim()
    if (text.length < 2) return
    dispatch(addAgentTeaching(text))
    setTeachInput('')
    toast.success(t('settings.agent.taughtToast'))
  }, [teachInput, dispatch, t])

  const openCitation = useCallback(
    (citation: LibraryChatCitation) => {
      dispatch(setActiveDocumentId(citation.documentId))
      const cached = peekCachedDocument(citation.documentId)
      if (cached) dispatch(setActiveDocument(cached))
      const query = citationSearchQuery(citation.snippet)
      if (query) dispatch(setPendingEditorSearch(query))
      void navigate(ROUTES.document(citation.documentId))
      onNavigate?.()
    },
    [dispatch, navigate, onNavigate],
  )

  const docTitle =
    activeDocument?.title?.trim() ||
    (activeDocumentId ? t('libraryChat.untitled') : null)
  const userInitial = useMemo(() => {
    const name = commentAuthor.trim()
    return name ? name.slice(0, 1).toUpperCase() : t('libraryChat.you').slice(0, 1)
  }, [commentAuthor, t])

  return (
    <div className="library-chat-panel agent-panel">
      <div className="shrink-0 border-b border-[var(--color-border)] px-2 py-2">
        <div
          className="inline-flex w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
          role="group"
          aria-label={t('agent.scopeLabel')}
        >
          <button
            type="button"
            className={cn('library-chat-scope-tab', scope === 'library' && 'is-active')}
            aria-pressed={scope === 'library'}
            onClick={() => changeScope('library')}
          >
            <Library className="h-3 w-3" />
            {t('agent.scopeLibrary')}
          </button>
          <button
            type="button"
            className={cn(
              'library-chat-scope-tab',
              scope === 'document' && 'is-active',
              !activeDocumentId && 'is-disabled',
            )}
            aria-pressed={scope === 'document'}
            disabled={!activeDocumentId}
            onClick={() => activeDocumentId && changeScope('document')}
          >
            <FileText className="h-3 w-3" />
            {t('agent.scopeDocument')}
          </button>
        </div>
        {scope === 'document' && docTitle ? (
          <div className="mt-1.5 flex items-start gap-2 px-0.5">
            <p className="library-chat-scope-meta">
              {t('agent.askingAbout', { title: docTitle })}
              <span>
                {' '}
                ·{' '}
                {messages.length > 0
                  ? t('agent.memoryTurns', { count: messages.length })
                  : t('agent.memoryHint')}
              </span>
            </p>
            {messages.length > 0 ? (
              <button
                type="button"
                className="library-chat-clear"
                title={t('agent.clearMemory')}
                onClick={() => void clearMemory()}
              >
                <Eraser className="h-3 w-3" />
                {t('agent.clearMemory')}
              </button>
            ) : null}
          </div>
        ) : displayMessages.length > 0 ? (
          <div className="mt-1.5 flex justify-end px-0.5">
            <button type="button" className="library-chat-clear" onClick={() => void clearMemory()}>
              <Eraser className="h-3 w-3" />
              {t('agent.clearSession')}
            </button>
          </div>
        ) : null}

        {scope === 'document' && toolOptions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1 px-0.5" aria-label={t('agent.capabilitiesLabel')}>
            {toolOptions.slice(0, 6).map((tool) => (
              <span key={tool} className="agent-capability-chip">
                {t(TOOL_LABEL_KEYS[tool])}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-1.5 px-0.5">
          <button
            type="button"
            className="library-chat-chip"
            onClick={() => setShowTeach((value) => !value)}
          >
            <GraduationCap className="mr-1 inline h-3 w-3" />
            {t('settings.agent.teachTitle')}
            {agentPrefs.teachings.length > 0 ? ` (${agentPrefs.teachings.length})` : ''}
          </button>
          <button
            type="button"
            className="library-chat-chip"
            onClick={() => navigate(ROUTES.settingsSection('agent'))}
          >
            <Settings2 className="mr-1 inline h-3 w-3" />
            {t('settings.sections.agent.label')}
          </button>
          {!agentPrefs.enabled ? (
            <span className="text-[11px] font-medium text-[var(--color-muted-foreground)]">
              {t('agent.disabled')}
            </span>
          ) : null}
        </div>

        {showTeach ? (
          <div className="mt-2 space-y-1.5 px-0.5">
            <form
              className="flex gap-1.5"
              onSubmit={(event) => {
                event.preventDefault()
                handleTeach()
              }}
            >
              <input
                className="library-chat-input"
                value={teachInput}
                maxLength={AGENT_TEACHING_MAX_LEN}
                placeholder={t('settings.agent.teachPlaceholder')}
                onChange={(event) => setTeachInput(event.target.value)}
              />
              <Button type="submit" size="sm" disabled={teachInput.trim().length < 2}>
                {t('settings.agent.teachAdd')}
              </Button>
            </form>
            {agentPrefs.teachings.slice(0, 4).map((item) => (
              <button
                key={item.id}
                type="button"
                className="library-chat-chip w-full justify-between text-left"
                title={t('settings.agent.teachRemove')}
                onClick={() => dispatch(removeAgentTeaching(item.id))}
              >
                <span className="truncate">{item.text}</span>
                <Eraser className="ml-1 h-3 w-3 shrink-0 opacity-70" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="library-chat-thread">
        <div className="flex flex-col gap-3 px-2.5 pb-3 pt-2">
          {historyLoading && displayMessages.length === 0 ? (
            <p className="library-chat-status">{t('agent.memoryLoading')}</p>
          ) : null}

          {displayMessages.length === 0 && !historyLoading ? (
            <div className="library-empty-state">
              <div className="library-empty-state-icon">
                <Bot className="h-5 w-5" />
              </div>
              <p className="library-chat-brand-badge" role="status">
                {t('agent.brandBadge')}
              </p>
              <p className="library-empty-state-title">
                {scope === 'document' ? t('agent.emptyTitleDocument') : t('agent.emptyTitle')}
              </p>
              <p className="library-empty-state-hint">
                {scope === 'document' ? t('agent.emptyHintDocument') : t('agent.emptyHint')}
              </p>
              {nlpReady === false || !agentPrefs.enabled ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    navigate(
                      ROUTES.settingsSection(!agentPrefs.enabled ? 'agent' : 'nlp'),
                    )
                  }
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  {!agentPrefs.enabled
                    ? t('settings.sections.agent.label')
                    : t('libraryChat.openSettings')}
                </Button>
              ) : null}
            </div>
          ) : null}

          {displayMessages.map((message) => (
            <Message key={message.id} className={cn(message.role === 'user' && 'items-end')}>
              {message.role === 'assistant' ? (
                <MessageAvatar>
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-[var(--color-accent)] text-[10px] text-white">
                      <Sparkles className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                </MessageAvatar>
              ) : (
                <MessageAvatar>
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-[11px]">{userInitial}</AvatarFallback>
                  </Avatar>
                </MessageAvatar>
              )}
              <MessageContent>
                <Bubble variant={message.role === 'user' ? 'primary' : 'muted'}>
                  <BubbleContent>
                    {message.role === 'assistant' && message.steps && message.steps.length > 0 ? (
                      <ol className="agent-step-trace" aria-label={t('agent.stepTrace')}>
                        {message.steps.map((step, index) => (
                          <li
                            key={`${message.id}-step-${index}`}
                            className={cn(
                              'agent-step-trace-item',
                              step.status === 'error' && 'is-error',
                              step.status === 'skipped' && 'is-skipped',
                            )}
                          >
                            <span className="agent-step-index">{index + 1}</span>
                            <span className="agent-step-tool">
                              {TOOL_LABEL_KEYS[step.tool]
                                ? t(TOOL_LABEL_KEYS[step.tool])
                                : step.tool}
                            </span>
                            <span className="agent-step-status">{step.status}</span>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    {message.role === 'assistant' ? (
                      <MarkdownView
                        source={message.text}
                        headingIds={false}
                        className="scribe-markdown--chat"
                      />
                    ) : (
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{message.text}</p>
                    )}
                  </BubbleContent>
                </Bubble>
                {message.role === 'assistant' && message.citations && message.citations.length > 0 ? (
                  <MessageFooter>
                    <div className="library-chat-sources">
                      <p className="text-[11px] font-medium text-[var(--color-muted-foreground)]">
                        {t('libraryChat.citations')}
                      </p>
                      {message.citations.map((citation, index) => (
                        <button
                          key={`${message.id}-cite-${index}`}
                          type="button"
                          className="library-chat-source"
                          onClick={() => openCitation(citation)}
                        >
                          {citation.title || t('libraryChat.untitled')}
                        </button>
                      ))}
                    </div>
                  </MessageFooter>
                ) : null}
                {message.role === 'assistant' && message.clarifyOptions && message.clarifyOptions.length > 0 ? (
                  <div className="library-chat-followups">
                    <p className="px-0.5 text-[11px] text-[var(--color-muted-foreground)]">
                      {t('agent.clarifyHint')}
                    </p>
                    {message.clarifyOptions.map((tool) => (
                      <button
                        key={tool}
                        type="button"
                        className="library-chat-followup"
                        disabled={loading}
                        onClick={() =>
                          void runGoal(t(TOOL_LABEL_KEYS[tool]), { forceTools: [tool] })
                        }
                      >
                        {t(TOOL_LABEL_KEYS[tool])}
                      </button>
                    ))}
                  </div>
                ) : null}
                {message.role === 'assistant' &&
                message.text &&
                !message.clarifyOptions?.length &&
                activeDocumentId ? (
                  <div className="mt-1.5">
                    <button
                      type="button"
                      className="library-chat-chip"
                      disabled={loading}
                      onClick={() => applyAnswerToNote(message.text)}
                    >
                      <FilePlus2 className="mr-1 inline h-3 w-3" />
                      {t('agent.applyToNote')}
                    </button>
                  </div>
                ) : null}
                {message.role === 'assistant' && message.followups && message.followups.length > 0 ? (
                  <div className="library-chat-followups">
                    {message.followups.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className="library-chat-followup"
                        disabled={loading}
                        onClick={() => void runGoal(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ) : null}
              </MessageContent>
            </Message>
          ))}

          {loading ? (
            <p className="library-chat-status">
              <span className="library-chat-typing" role="status">
                <span className="library-chat-typing-dot" />
                <span className="library-chat-typing-dot" />
                <span className="library-chat-typing-dot" />
              </span>
              {t('agent.thinking')}
            </p>
          ) : null}
          <div ref={threadEndRef} />
        </div>
      </div>

      <div className="library-chat-composer">
        <div className="library-chat-actions">
          {AGENT_RECIPES.filter((recipe) =>
            scope === 'library' ? !recipe.documentPreferred : true,
          ).map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              className="library-chat-chip"
              disabled={loading || !agentPrefs.enabled}
              onClick={() => void runGoal('', { recipeId: recipe.id })}
            >
              {t(recipe.labelKey)}
            </button>
          ))}
          {goalChips.map((chip) => (
            <button
              key={chip}
              type="button"
              className="library-chat-chip"
              disabled={loading || !agentPrefs.enabled}
              onClick={() => void runGoal(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
        <form
          className="flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            void runGoal(input)
          }}
        >
          <input
            className="library-chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              scope === 'document' ? t('agent.placeholderDocument') : t('agent.placeholder')
            }
            disabled={loading || !agentPrefs.enabled}
            aria-label={t('agent.placeholder')}
          />
          <Button type="submit" size="sm" disabled={loading || !agentPrefs.enabled || !input.trim()}>
            <Send className="h-3.5 w-3.5" />
            {t('agent.send')}
          </Button>
        </form>
      </div>
    </div>
  )
}
