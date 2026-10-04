import { Eraser, FilePlus2, FileText, Folder, GraduationCap, Library, Send, Settings2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { MarkdownView } from '@/components/MarkdownView'
import { AgentBlobatar, AGENT_BLOBATAR_NAME, type AgentBlobatarMood } from '@/components/agent/AgentBlobatar'
import {
  AgentApplyPreviewDialog,
  type AgentApplyPreviewKind,
} from '@/components/agent/AgentApplyPreviewDialog'
import { LocalIntelligenceStatus } from '@/components/nlp/LocalIntelligenceStatus'
import { CompareNotesDialog } from '@/components/agent/CompareNotesDialog'
import { withLlmChunkListener } from '@/lib/nlp/llm-stream'
import { storageFsServerStart } from '@/lib/storage/files-api-server'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
} from '@/components/ui/message'
import { getCachedParsedContent, peekCachedDocument } from '@/lib/cache/document-cache'
import {
  appendAgentMessage,
  appendAgentRun,
  clearAgentMessages,
  listAgentMessages,
  listAgentRuns,
  type AgentBackendRun,
  type AgentMessageStep,
  type DocumentChatCitation,
} from '@/lib/db/api'
import {
  nlpDocumentAnalysis,
  nlpDocumentTasks,
  nlpSpellcheck,
  nlpStatus,
  nlpSuggestTags,
  nlpSuggestWikiLinks,
  type DocumentTask,
  type NlpDocumentAnalysis,
  type WikiLinkSuggestion,
} from '@/lib/db/nlp-api'
import { applySpellSuggestion, applyWikiSuggestion } from '@/lib/editor/apply-suggestions'
import {
  applyAgentAnswer,
  replaceSelectionWithAnswer,
  stripAnswerMarkdown,
  undoAgentApply,
  type AgentApplyMode,
} from '@/lib/editor/insert-ai-answer'
import {
  agentMemoryContext,
  runAgentGoal,
  type AgentStep,
  type AgentToolId,
} from '@/lib/library/agent'
import { applySuggestedTagsToDocument } from '@/lib/library/auto-organize'
import { runFolderDigest } from '@/lib/library/folder-digest'
import { AGENT_RECIPES, type AgentRecipeId } from '@/lib/library/agent-recipes'
import {
  buildAgentGoalChips,
  buildAgentToolOptions,
  LIBRARY_AGENT_STARTER_CHIPS,
} from '@/lib/library/agent-suggestions'
import { AGENT_TEACHING_MAX_LEN } from '@/lib/library/agent-prefs'
import {
  AGENT_TEACH_DRAFT_MAX_LEN,
  canDistillTeachingWithLlm,
  distillTeachingWithLlm,
} from '@/lib/library/agent-teach'
import type { ChatScope, LibraryChatCitation } from '@/lib/library/library-chat'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { citationSearchQuery } from '@/lib/editor/citation-jump'
import { setActiveDocument, setActiveDocumentId, setPendingEditorSearch } from '@/store/documentsSlice'
import { addAgentTeaching, removeAgentTeaching, setAgentPrefs } from '@/store/settingsSlice'
import { setSaveCustomTemplateDialog } from '@/store/templatesSlice'

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
  onClose?: () => void
  variant?: 'embedded' | 'dock'
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
  brief: 'agent.tools.brief',
  explain: 'agent.tools.explain',
  simplify: 'agent.tools.simplify',
  action_items: 'agent.tools.action_items',
  glossary: 'agent.tools.glossary',
  compare_notes: 'agent.tools.compare_notes',
  section_summaries: 'agent.tools.section_summaries',
  decisions: 'agent.tools.decisions',
  quotes: 'agent.tools.quotes',
  pii: 'agent.tools.pii',
  rank_tasks: 'agent.tools.rank_tasks',
  contradictions: 'agent.tools.contradictions',
  files_answer: 'agent.tools.files_answer',
  save_template: 'agent.tools.save_template',
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

export function AgentPanel({ onNavigate, onClose: _onClose, variant = 'embedded' }: AgentPanelProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const activeDocumentId = useAppSelector((state) => state.documents.activeDocumentId)
  const documents = useAppSelector((state) => state.documents.documents)
  const commentAuthor = useAppSelector((state) => state.documents.commentAuthor)
  const agentPrefs = useAppSelector((state) => state.settings.agentPrefs)
  const activeDocument = activeDocumentId ? peekCachedDocument(activeDocumentId) : null
  const activeDocumentSummary = useMemo(
    () => documents.find((doc) => doc.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  )

  const [scope, setScope] = useState<ChatScope>(() =>
    activeDocumentId ? 'document' : 'library',
  )
  const [input, setInput] = useState('')
  const [teachInput, setTeachInput] = useState('')
  const [showTeach, setShowTeach] = useState(false)
  const [teachTopic, setTeachTopic] = useState<'general' | 'grammar'>('general')
  const [teachWithAi, setTeachWithAi] = useState(true)
  const [teachBusy, setTeachBusy] = useState(false)
  const [llmTeachReady, setLlmTeachReady] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [messages, setMessages] = useState<AgentThreadMessage[]>([])
  const [sessionMessages, setSessionMessages] = useState<AgentThreadMessage[]>([])
  const [analysis, setAnalysis] = useState<NlpDocumentAnalysis | null>(null)
  const [tasks, setTasks] = useState<DocumentTask[] | null>(null)
  const [nlpReady, setNlpReady] = useState<boolean | null>(null)
  const [runHistory, setRunHistory] = useState<AgentBackendRun[]>([])
  const [showRuns, setShowRuns] = useState(false)
  const [blobMood, setBlobMood] = useState<AgentBlobatarMood>('idle')
  const [applyPreview, setApplyPreview] = useState<AgentApplyPreviewKind | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [pendingCompareGoal, setPendingCompareGoal] = useState('')
  const [filesOfflineHint, setFilesOfflineHint] = useState(false)
  const [applyBusy, setApplyBusy] = useState(false)
  const applyPendingRef = useRef<null | (() => Promise<void> | void)>(null)
  const moodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const slovak = i18n.language?.toLowerCase().startsWith('sk')

  const displayMessages = scope === 'document' ? messages : sessionMessages

  const refreshRunHistory = useCallback(() => {
    void listAgentRuns(24)
      .then(setRunHistory)
      .catch(() => setRunHistory([]))
  }, [])

  useEffect(() => {
    if (activeDocumentId) {
      setScope((prev) => (prev === 'folder' ? prev : 'document'))
    } else {
      setScope((prev) => (prev === 'document' ? 'library' : prev))
    }
  }, [activeDocumentId])

  useEffect(() => {
    void nlpStatus()
      .then((status) => setNlpReady(Boolean(status.enabled && status.sidecarOk)))
      .catch(() => setNlpReady(false))
    refreshRunHistory()
  }, [refreshRunHistory])

  useEffect(() => {
    if (!showTeach) return
    let cancelled = false
    void canDistillTeachingWithLlm().then((ready) => {
      if (!cancelled) setLlmTeachReady(ready)
    })
    return () => {
      cancelled = true
    }
  }, [showTeach])

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
    if (scope === 'folder' && activeDocument?.folderId) {
      return [
        t('agent.starters.folderWhatsNew'),
        ...LIBRARY_AGENT_STARTER_CHIPS.map((key) => t(key)),
      ]
    }
    return LIBRARY_AGENT_STARTER_CHIPS.map((key) => t(key))
  }, [scope, activeDocumentId, analysis, tasks, activeDocument?.title, activeDocument?.folderId, slovak, t])

  const answerFollowups = useMemo(
    () => [
      { id: 'continue', label: t('agent.followupContinue'), goal: t('agent.followupContinueGoal') },
      { id: 'shorten', label: t('agent.followupShorten'), goal: t('agent.followupShortenGoal') },
      { id: 'checklist', label: t('agent.followupChecklist'), goal: t('agent.followupChecklistGoal') },
      { id: 'related', label: t('agent.followupRelated'), goal: t('agent.followupRelatedGoal') },
    ],
    [t],
  )

  const setMoodBriefly = useCallback((mood: AgentBlobatarMood) => {
    if (moodTimerRef.current) clearTimeout(moodTimerRef.current)
    setBlobMood(mood)
    if (mood === 'done' || mood === 'error') {
      moodTimerRef.current = setTimeout(() => setBlobMood('idle'), 2200)
    }
  }, [])

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
      opts?: {
        recipeId?: AgentRecipeId
        forceTools?: AgentToolId[]
        compareDocumentId?: string | null
      },
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

      if (
        opts?.forceTools?.includes('compare_notes') &&
        !opts.compareDocumentId &&
        scope === 'document' &&
        activeDocumentId
      ) {
        setPendingCompareGoal(trimmed || t('agent.tools.compare_notes'))
        setCompareOpen(true)
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
      setBlobMood('thinking')
      setFilesOfflineHint(false)

      const streamingId = `local-assistant-stream-${Date.now()}`
      const appendAssistant = (msg: AgentThreadMessage) => {
        if (scope === 'document') setMessages((prev) => [...prev, msg])
        else setSessionMessages((prev) => [...prev, msg])
      }
      const patchAssistant = (id: string, patch: Partial<AgentThreadMessage>) => {
        const updater = (prev: AgentThreadMessage[]) =>
          prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
        if (scope === 'document') setMessages(updater)
        else setSessionMessages(updater)
      }

      appendAssistant({
        id: streamingId,
        role: 'assistant',
        text: '',
        createdAt: Date.now(),
      })

      try {
        const digestGoal =
          /folder \(7 days\)|priečinku \(7 dní\)|priecinku \(7 dni\)/i.test(trimmed) ||
          /what.?s new in this folder|čo je nové v priečinku/i.test(trimmed)
        const libraryRecipes = new Set<AgentRecipeId>([
          'daily_digest',
          'weekly_review',
          'files_digest',
          'cleanup',
        ])
        const forceLibrary = Boolean(opts?.recipeId && libraryRecipes.has(opts.recipeId))
        const runScope = forceLibrary ? 'library' : scope
        const runDocumentId = forceLibrary ? null : activeDocumentId
        let streamed = ''
        const result =
          runScope === 'folder' && activeDocument?.folderId && digestGoal
            ? await runFolderDigest(activeDocument.folderId).then((answer) => ({
                answer: answer.answer,
                citations: answer.citations,
                steps: [{ tool: 'brief' as AgentToolId, status: 'ok' as const, detail: 'folder-digest' }],
                followups: answer.followups,
                needsClarification: false as const,
                nextPrefs: null,
              }))
            : await withLlmChunkListener(
                (chunk) => {
                  streamed += chunk
                  const snapshot = streamed
                  patchAssistant(streamingId, { text: snapshot })
                },
                () =>
                  runAgentGoal(
                    trimmed || displayGoal,
                    runScope,
                    runDocumentId,
                    agentMemoryContext(prior),
                    agentPrefs,
                    {
                      ...opts,
                      folderId: runScope === 'folder' ? activeDocument?.folderId : null,
                      stream: true,
                    },
                  ),
              )

        if (result.nextPrefs) {
          dispatch(setAgentPrefs(result.nextPrefs))
        }

        if (result.needsClarification) {
          patchAssistant(streamingId, {
            text: t('agent.clarifyPrompt'),
            clarifyOptions: result.clarifyOptions,
          })
          setMoodBriefly('done')
          return
        }

        const assistant: AgentThreadMessage = {
          id: streamingId,
          role: 'assistant',
          text: streamed.trim() || result.answer || t('agent.emptyResult'),
          citations: result.citations,
          steps: result.steps,
          followups: result.followups,
          createdAt: Date.now(),
        }
        patchAssistant(streamingId, assistant)
        if (scope === 'document') {
          await persistPair(trimmed || displayGoal, assistant)
        }
        void appendAgentRun({
          scope: scope === 'folder' ? 'library' : scope,
          documentId: activeDocumentId,
          goal: trimmed || displayGoal,
          stepsJson: JSON.stringify(toPersistSteps(assistant.steps ?? [])),
          answer: assistant.text,
        })
          .then(() => refreshRunHistory())
          .catch(() => undefined)
        setMoodBriefly('done')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message === 'agent.filesApiOffline' || message.includes('FilesApiOffline')) {
          setFilesOfflineHint(true)
          patchAssistant(streamingId, { text: t('agent.filesApiOffline') })
        } else {
          patchAssistant(streamingId, {
            text:
              message.startsWith('agent.') || message.startsWith('libraryChat.')
                ? t(message)
                : message,
          })
        }
        const key = message.startsWith('libraryChat.') || message.startsWith('agent.') ? message : null
        toast.error(t('agent.errorTitle'), key ? t(key) : message)
        setMoodBriefly('error')
      } finally {
        setLoading(false)
      }
    },
    [loading, agentPrefs, scope, activeDocumentId, activeDocument?.folderId, messages, sessionMessages, persistPair, t, dispatch, refreshRunHistory, setMoodBriefly],
  )

  const queueInsertPreview = useCallback(
    (text: string, mode: AgentApplyMode = 'callout') => {
      if (!activeDocumentId) {
        toast.error(t('libraryChat.noActiveDocument'))
        return
      }
      setApplyPreview({ type: 'insert', mode, text })
      applyPendingRef.current = () => {
        const ok = applyAgentAnswer(text, mode, { sourceTitle: t('agent.brandBadge') })
        if (ok) toast.success(t('agent.appliedToNote'))
        else toast.error(t('agent.applyFailed'))
      }
    },
    [activeDocumentId, t],
  )

  const handleSaveAsTemplate = useCallback(() => {
    if (!activeDocument) {
      toast.error(t('libraryChat.noActiveDocument'))
      return
    }
    dispatch(
      setSaveCustomTemplateDialog({
        open: true,
        content: getCachedParsedContent(activeDocument),
        suggestedName: activeDocument.title,
        suggestedTitle: activeDocument.title,
      }),
    )
  }, [activeDocument, dispatch, t])

  const preferredApplyMode = useCallback((steps?: AgentStep[]): AgentApplyMode => {
    const tools = (steps ?? []).map((step) => step.tool)
    if (tools.includes('tasks') || tools.includes('takeaways') || tools.includes('dates')) {
      return 'checklist'
    }
    if (tools.includes('meeting') || tools.includes('brief')) {
      return 'frontmatter'
    }
    return 'callout'
  }, [])

  const applyFromSteps = useCallback(
    async (text: string, steps?: AgentStep[]) => {
      if (!activeDocumentId) {
        toast.error(t('libraryChat.noActiveDocument'))
        return
      }
      const tools = new Set((steps ?? []).map((step) => step.tool))
      const mode = preferredApplyMode(steps)

      try {
        if (tools.has('save_template')) {
          handleSaveAsTemplate()
          return
        }

        if (tools.has('spellcheck')) {
          const fromSteps = (steps ?? [])
            .flatMap((step) => step.spellIssues ?? [])
            .filter((issue) => issue.word && issue.suggestions[0])
          const result =
            fromSteps.length > 0
              ? null
              : await nlpSpellcheck(activeDocumentId).catch(() => null)
          const fixes = (
            fromSteps.length
              ? fromSteps.map((issue) => ({
                  word: issue.word,
                  suggestion: issue.suggestions[0]!,
                }))
              : (result?.issues ?? [])
                  .filter((issue) => issue.suggestions[0])
                  .map((issue) => ({
                    word: issue.word,
                    suggestion: issue.suggestions[0]!,
                  }))
          ).slice(0, 24)

          setApplyPreview({ type: 'spellcheck', fixes })
          applyPendingRef.current = () => {
            let applied = 0
            for (const fix of fixes) {
              if (applySpellSuggestion(fix.word, fix.suggestion)) applied += 1
            }
            if (applied > 0) {
              toast.success(t('agent.applySpellcheckDone', { count: applied }))
            } else {
              toast.error(t('agent.applySpellcheckFailed'))
            }
          }
          return
        }

        if (tools.has('organize') && activeDocumentSummary) {
          const suggestions = await nlpSuggestTags(activeDocumentSummary.id)
          const existing = new Set(activeDocumentSummary.tags.map((tag) => tag.trim().toLowerCase()))
          const tags = suggestions.tagSuggestions
            .map((tag) => tag.trim())
            .filter((tag) => tag && !existing.has(tag.toLowerCase()))
          setApplyPreview({
            type: 'organize',
            tags,
            folderSuggestion: suggestions.folderSuggestion,
          })
          applyPendingRef.current = async () => {
            const result = await applySuggestedTagsToDocument(activeDocumentSummary, dispatch)
            if (result.added.length) {
              toast.success(t('agent.applyOrganizeDone', { tags: result.added.join(', ') }))
            } else if (result.folderSuggestion) {
              toast.success(t('agent.applyOrganizeFolder', { folder: result.folderSuggestion }))
            } else {
              toast.success(t('agent.applyOrganizeNone'))
            }
          }
          return
        }

        if (tools.has('wiki')) {
          const suggestions = await nlpSuggestWikiLinks(activeDocumentId, 6)
          const first = suggestions?.[0] as WikiLinkSuggestion | undefined
          if (first) {
            setApplyPreview({
              type: 'wiki',
              phrase: first.phrase || first.title,
              title: first.title,
              documentId: first.documentId,
            })
            applyPendingRef.current = () => {
              const result = applyWikiSuggestion(first)
              if (result === 'failed') toast.error(t('agent.applyWikiFailed'))
              else toast.success(t('agent.applyWikiDone', { title: first.title }))
            }
            return
          }
        }

        if (tools.has('rewrite') || tools.has('simplify')) {
          const rewriteStep = (steps ?? []).find(
            (step) =>
              (step.tool === 'rewrite' || step.tool === 'simplify') && step.status === 'ok',
          )
          const before =
            rewriteStep?.citations?.[0]?.snippet?.trim() ||
            text.match(/\*\*Rewrite\*\*[^\n]*\n+([\s\S]+)/i)?.[1]?.slice(0, 400) ||
            ''
          const after = stripAnswerMarkdown(text)
          setApplyPreview({ type: 'replace', before, after })
          applyPendingRef.current = () => {
            const ok = replaceSelectionWithAnswer(after)
            if (ok) toast.success(t('agent.appliedToNote'))
            else toast.error(t('agent.applyFailed'))
          }
          return
        }

        const insertMode =
          tools.has('tasks') || tools.has('takeaways') || tools.has('action_items')
            ? 'checklist'
            : mode
        queueInsertPreview(text, insertMode)
      } catch (error) {
        toast.error(t('agent.applyFailed'), String(error))
      }
    },
    [
      activeDocumentId,
      activeDocumentSummary,
      dispatch,
      handleSaveAsTemplate,
      preferredApplyMode,
      queueInsertPreview,
      t,
    ],
  )

  const confirmApplyPreview = useCallback(async () => {
    const action = applyPendingRef.current
    if (!action) {
      setApplyPreview(null)
      return
    }
    setApplyBusy(true)
    try {
      await action()
      setApplyPreview(null)
      applyPendingRef.current = null
    } finally {
      setApplyBusy(false)
    }
  }, [])

  const handleTeach = useCallback(async () => {
    const draft = teachInput.trim()
    if (draft.length < 2 || teachBusy) return
    setTeachBusy(true)
    try {
      const result = teachWithAi
        ? await distillTeachingWithLlm(draft, {
            force: draft.length > AGENT_TEACHING_MAX_LEN || draft.includes('\n'),
            topic: teachTopic,
          })
        : { text: draft.slice(0, AGENT_TEACHING_MAX_LEN), distilled: false }
      if (scope === 'document' && activeDocumentId) {
        dispatch(
          addAgentTeaching({
            text: result.text,
            scope: 'document',
            documentId: activeDocumentId,
            topic: teachTopic,
          }),
        )
      } else {
        dispatch(addAgentTeaching({ text: result.text, topic: teachTopic }))
      }
      setTeachInput('')
      toast.success(
        result.distilled
          ? t('settings.agent.teachRefinedToast')
          : teachTopic === 'grammar'
            ? t('settings.agent.taughtGrammarToast')
            : t('settings.agent.taughtToast'),
      )
    } catch {
      toast.error(t('settings.agent.teachRefineOffline'))
    } finally {
      setTeachBusy(false)
    }
  }, [teachInput, teachBusy, teachWithAi, teachTopic, dispatch, t, scope, activeDocumentId])

  const handleSaveReplyAsTeaching = useCallback(
    async (text: string) => {
      const draft = text.trim()
      if (draft.length < 2 || teachBusy) return
      setTeachBusy(true)
      try {
        const result = await distillTeachingWithLlm(draft, { force: true })
        if (scope === 'document' && activeDocumentId) {
          dispatch(
            addAgentTeaching({
              text: result.text,
              scope: 'document',
              documentId: activeDocumentId,
            }),
          )
        } else {
          dispatch(addAgentTeaching(result.text))
        }
        toast.success(
          result.distilled ? t('settings.agent.teachRefinedToast') : t('settings.agent.taughtToast'),
        )
      } catch {
        toast.error(t('settings.agent.teachRefineOffline'))
      } finally {
        setTeachBusy(false)
      }
    },
    [activeDocumentId, dispatch, scope, t, teachBusy],
  )

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
  const userBlobatarName = useMemo(() => {
    const name = commentAuthor.trim()
    if (name) return name
    return t('libraryChat.you')
  }, [commentAuthor, t])

  return (
    <div className={cn('library-chat-panel agent-panel', variant === 'dock' && 'agent-panel--dock')}>
      <div className="agent-panel-toolbar shrink-0">
        <div
          className="agent-scope-switch"
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
            className={cn('library-chat-scope-tab', scope === 'folder' && 'is-active')}
            aria-pressed={scope === 'folder'}
            disabled={!activeDocument?.folderId}
            onClick={() => changeScope('folder')}
            title={
              activeDocument?.folderId
                ? t('agent.scopeFolderHint')
                : t('agent.scopeFolderNeedsDoc')
            }
          >
            <Folder className="h-3 w-3" />
            {t('agent.scopeFolder')}
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
            className={cn('library-chat-chip', showRuns && 'is-active')}
            onClick={() => {
              setShowRuns((value) => !value)
              refreshRunHistory()
            }}
          >
            {t('agent.runHistory')}
            {runHistory.length > 0 ? ` (${runHistory.length})` : ''}
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
            <p className="px-0.5 text-[11px] text-[var(--color-muted-foreground)]">
              {scope === 'document' && activeDocumentId
                ? t('settings.agent.teachScopeDocument')
                : t('settings.agent.teachScopeGlobal')}
            </p>
            <div
              className="agent-scope-switch"
              role="group"
              aria-label={t('settings.agent.teachTopicLabel')}
            >
              <button
                type="button"
                className={cn('library-chat-scope-tab', teachTopic === 'general' && 'is-active')}
                onClick={() => setTeachTopic('general')}
              >
                {t('settings.agent.teachTopicGeneral')}
              </button>
              <button
                type="button"
                className={cn('library-chat-scope-tab', teachTopic === 'grammar' && 'is-active')}
                onClick={() => setTeachTopic('grammar')}
              >
                {t('settings.agent.teachTopicGrammar')}
              </button>
            </div>
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(event) => {
                event.preventDefault()
                void handleTeach()
              }}
            >
              <textarea
                className="library-chat-input min-h-[4.5rem] resize-y"
                value={teachInput}
                maxLength={AGENT_TEACH_DRAFT_MAX_LEN}
                placeholder={
                  teachTopic === 'grammar'
                    ? t('settings.agent.teachPlaceholderGrammar')
                    : teachWithAi
                      ? t('settings.agent.teachPlaceholderLong')
                      : scope === 'document' && activeDocumentId
                        ? t('settings.agent.teachPlaceholderDocument')
                        : t('settings.agent.teachPlaceholder')
                }
                onChange={(event) => setTeachInput(event.target.value)}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className={cn('library-chat-chip', teachWithAi && 'is-active')}
                  aria-pressed={teachWithAi}
                  title={t('settings.agent.teachRefineHint')}
                  onClick={() => setTeachWithAi((value) => !value)}
                >
                  <Sparkles className="mr-1 inline h-3 w-3" />
                  {t('settings.agent.teachRefine')}
                </button>
                {teachWithAi && llmTeachReady === false ? (
                  <span className="text-[11px] text-[var(--color-muted-foreground)]">
                    {t('settings.agent.teachRefineOffline')}
                  </span>
                ) : null}
                <Button
                  type="submit"
                  size="sm"
                  className="ml-auto"
                  disabled={teachInput.trim().length < 2 || teachBusy}
                >
                  {teachBusy ? t('settings.agent.teachRefineBusy') : t('settings.agent.teachAdd')}
                </Button>
              </div>
            </form>
            {agentPrefs.teachings
              .filter((item) => {
                if (scope === 'document' && activeDocumentId) {
                  return (
                    !item.scope ||
                    item.scope === 'global' ||
                    (item.scope === 'document' && item.documentId === activeDocumentId)
                  )
                }
                return !item.scope || item.scope === 'global'
              })
              .slice(0, 4)
              .map((item) => (
              <button
                key={item.id}
                type="button"
                className="library-chat-chip w-full justify-between text-left"
                title={t('settings.agent.teachRemove')}
                onClick={() => dispatch(removeAgentTeaching(item.id))}
              >
                <span className="truncate">
                  {item.scope === 'document' ? (
                    <span className="mr-1 text-[10px] uppercase tracking-wide opacity-60">
                      {t('settings.agent.teachBadgeDocument')}
                    </span>
                  ) : null}
                  {item.topic === 'grammar' ? (
                    <span className="mr-1 text-[10px] uppercase tracking-wide text-[var(--color-accent)] opacity-80">
                      {t('settings.agent.teachBadgeGrammar')}
                    </span>
                  ) : null}
                  {item.text}
                </span>
                <Eraser className="ml-1 h-3 w-3 shrink-0 opacity-70" />
              </button>
            ))}
          </div>
        ) : null}

        {showRuns ? (
          <div className="agent-run-history mt-2 space-y-1.5 px-0.5">
            {runHistory.length === 0 ? (
              <p className="px-0.5 text-[11px] text-[var(--color-muted-foreground)]">
                {t('agent.runHistoryEmpty')}
              </p>
            ) : (
              runHistory.map((run) => {
                const when = new Date(run.createdAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
                let stepCount = 0
                try {
                  const parsed = JSON.parse(run.stepsJson || '[]') as unknown
                  if (Array.isArray(parsed)) stepCount = parsed.length
                } catch {
                  stepCount = 0
                }
                return (
                  <button
                    key={run.id}
                    type="button"
                    className="agent-run-history-item"
                    disabled={loading}
                    onClick={() => {
                      setInput(run.goal)
                      setShowRuns(false)
                    }}
                  >
                    <span className="agent-run-history-goal">{run.goal}</span>
                    <span className="agent-run-history-meta">
                      {when}
                      {stepCount > 0 ? ` · ${t('agent.runHistorySteps', { count: stepCount })}` : ''}
                      {run.answer ? ` · ${run.answer.slice(0, 72)}${run.answer.length > 72 ? '…' : ''}` : ''}
                    </span>
                  </button>
                )
              })
            )}
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
              <div className="library-empty-state-icon agent-empty-blobatar">
                <AgentBlobatar
                  name={AGENT_BLOBATAR_NAME}
                  size={40}
                  mood={loading ? 'thinking' : blobMood}
                  title={t('agent.faceTitle')}
                />
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
              <LocalIntelligenceStatus className="mt-3 w-full max-w-md" compact />
              <div className="mt-3 flex max-w-md flex-wrap justify-center gap-1.5">
                {(scope === 'document'
                  ? ([
                      'agent.quickPrompts.explain',
                      'agent.quickPrompts.glossary',
                      'agent.quickPrompts.takeaways',
                    ] as const)
                  : ([
                      'agent.starters.themes',
                      'agent.starters.openLoops',
                      'agent.starters.deadlines',
                    ] as const)
                ).map((key) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={loading || !agentPrefs.enabled}
                    onClick={() => void runGoal(t(key))}
                  >
                    {t(key)}
                  </Button>
                ))}
              </div>
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
                  <AgentBlobatar
                    name={AGENT_BLOBATAR_NAME}
                    size={28}
                    title={t('agent.faceTitle')}
                  />
                </MessageAvatar>
              ) : (
                <MessageAvatar>
                  <AgentBlobatar
                    name={userBlobatarName}
                    size={28}
                    title={t('agent.yourFaceTitle')}
                  />
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
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="library-chat-chip is-active"
                      disabled={loading}
                      onClick={() =>
                        void applyFromSteps(message.text, message.steps)
                      }
                    >
                      <FilePlus2 className="mr-1 inline h-3 w-3" />
                      {(message.steps ?? []).some((step) => step.tool === 'spellcheck')
                        ? t('agent.applySpellcheck')
                        : t('agent.applySmart')}
                    </button>
                    <button
                      type="button"
                      className="library-chat-chip"
                      disabled={teachBusy || loading}
                      onClick={() => void handleSaveReplyAsTeaching(message.text)}
                    >
                      <GraduationCap className="mr-1 inline h-3 w-3" />
                      {t('settings.agent.teachSaveReply')}
                    </button>
                    <button
                      type="button"
                      className="library-chat-chip"
                      disabled={loading}
                      onClick={() => queueInsertPreview(message.text, 'callout')}
                    >
                      {t('agent.applyCallout')}
                    </button>
                    <button
                      type="button"
                      className="library-chat-chip"
                      disabled={loading}
                      onClick={() => queueInsertPreview(message.text, 'checklist')}
                    >
                      {t('agent.applyChecklist')}
                    </button>
                    <button
                      type="button"
                      className="library-chat-chip"
                      disabled={loading}
                      onClick={() => queueInsertPreview(message.text, 'frontmatter')}
                    >
                      {t('agent.applyFrontmatter')}
                    </button>
                    <button
                      type="button"
                      className="library-chat-chip"
                      disabled={loading || !activeDocument}
                      onClick={handleSaveAsTemplate}
                    >
                      {t('agent.saveAsTemplate')}
                    </button>
                    <button
                      type="button"
                      className="library-chat-chip"
                      disabled={loading}
                      onClick={() => {
                        if (undoAgentApply()) toast.success(t('agent.applyUndone'))
                      }}
                    >
                      {t('agent.applyUndo')}
                    </button>
                  </div>
                ) : null}
                {message.role === 'assistant' &&
                message.text &&
                !message.clarifyOptions?.length &&
                !activeDocumentId ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="library-chat-chip"
                      disabled={teachBusy || loading}
                      onClick={() => void handleSaveReplyAsTeaching(message.text)}
                    >
                      <GraduationCap className="mr-1 inline h-3 w-3" />
                      {t('settings.agent.teachSaveReply')}
                    </button>
                  </div>
                ) : null}
                {message.role === 'assistant' && message.followups && message.followups.length > 0 ? (
                  <div className="library-chat-followups">
                    {message.followups.map((item) => {
                      if (item.startsWith('recipe:')) {
                        const recipeId = item.slice('recipe:'.length) as AgentRecipeId
                        const recipe = AGENT_RECIPES.find((row) => row.id === recipeId)
                        if (!recipe) return null
                        return (
                          <button
                            key={item}
                            type="button"
                            className="library-chat-followup"
                            disabled={loading}
                            onClick={() => void runGoal('', { recipeId })}
                          >
                            {t(recipe.labelKey)}
                          </button>
                        )
                      }
                      return (
                        <button
                          key={item}
                          type="button"
                          className="library-chat-followup"
                          disabled={loading}
                          onClick={() => {
                            if (/^apply spelling fixes$/i.test(item.trim())) {
                              void applyFromSteps(message.text, message.steps)
                              return
                            }
                            void runGoal(item)
                          }}
                        >
                          {item}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                {message.role === 'assistant' &&
                message.text &&
                !message.clarifyOptions?.length ? (
                  <div className="library-chat-followups">
                    {answerFollowups.map((item) => (
                      <button
                        key={`${message.id}-${item.id}`}
                        type="button"
                        className="library-chat-followup"
                        disabled={loading}
                        onClick={() => {
                          if (item.id === 'checklist') {
                            queueInsertPreview(message.text, 'checklist')
                            return
                          }
                          void runGoal(item.goal)
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </MessageContent>
            </Message>
          ))}

          {loading ? (
            <div className="library-chat-status agent-thinking-row" role="status">
              <AgentBlobatar
                name={AGENT_BLOBATAR_NAME}
                size={22}
                mood="thinking"
                title={t('agent.faceTitle')}
              />
              <span className="library-chat-typing">
                <span className="library-chat-typing-dot" />
                <span className="library-chat-typing-dot" />
                <span className="library-chat-typing-dot" />
              </span>
              <span>{t('agent.thinking')}</span>
            </div>
          ) : null}
          <div ref={threadEndRef} />
        </div>
      </div>

      <div className="library-chat-composer">
        {filesOfflineHint ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-2.5 py-2 text-[12px]">
            <span className="text-[var(--color-muted-foreground)]">{t('agent.filesApiOffline')}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => {
                void storageFsServerStart()
                  .then(() => {
                    setFilesOfflineHint(false)
                    toast.success(t('localIntelligence.filesOn'))
                  })
                  .catch((error) => toast.error(t('agent.errorTitle'), String(error)))
              }}
            >
              {t('localIntelligence.startFilesApi')}
            </Button>
          </div>
        ) : null}
        <div className="library-chat-actions">
          <button
            type="button"
            className="library-chat-chip"
            disabled={loading || !agentPrefs.enabled}
            onClick={() =>
              void runGoal(t('agent.quickPrompts.askFiles'), { forceTools: ['files_answer'] })
            }
          >
            {t('agent.tools.files_answer')}
          </button>
          {scope === 'document' ? (
            <button
              type="button"
              className="library-chat-chip"
              disabled={loading || !agentPrefs.enabled || !activeDocumentId}
              onClick={() => void runGoal(t('agent.tools.compare_notes'), { forceTools: ['compare_notes'] })}
            >
              {t('agent.tools.compare_notes')}
            </button>
          ) : null}
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

      <AgentApplyPreviewDialog
        open={Boolean(applyPreview)}
        preview={applyPreview}
        busy={applyBusy}
        onOpenChange={(next) => {
          if (!next) {
            setApplyPreview(null)
            applyPendingRef.current = null
          }
        }}
        onConfirm={() => void confirmApplyPreview()}
      />
      <CompareNotesDialog
        open={compareOpen}
        excludeDocumentId={activeDocumentId}
        onClose={() => {
          setCompareOpen(false)
          setPendingCompareGoal('')
        }}
        onSelect={(documentId) => {
          setCompareOpen(false)
          const goal = pendingCompareGoal
          setPendingCompareGoal('')
          void runGoal(goal, {
            forceTools: ['compare_notes'],
            compareDocumentId: documentId,
          })
        }}
      />
    </div>
  )
}
