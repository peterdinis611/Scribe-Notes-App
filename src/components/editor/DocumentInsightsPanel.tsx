import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowUpRight,
  AtSign,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  FileText,
  FolderInput,
  Gauge,
  Hash,
  Languages,
  LayoutTemplate,
  ListTree,
  LoaderCircle,
  MessageCircle,
  Network,
  PanelRightClose,
  RotateCcw,
  Sparkles,
  SpellCheck,
  Square,
} from 'lucide-react'
import type { SearchHit } from '@/lib/db/api'
import {
  nlpAnalyzePlaintext,
  nlpDocumentAnalysis,
  nlpDocumentTasks,
  nlpSimilarDocuments,
  nlpSpellcheck,
  nlpStatus,
  nlpSuggestTags,
  nlpSuggestWikiLinks,
  nlpTemplateFillHints,
  type DocumentTask,
  type NlpDocumentAnalysis,
  type NlpTemplateFillHints,
  type SpellcheckResult,
  type WikiLinkSuggestion,
} from '@/lib/db/nlp-api'
import { isVaultCipherJson } from '@/lib/vault/crypto'
import { isVaultUnlocked } from '@/lib/vault/session'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import {
  expectedSectionsForTemplate,
  templateCoachFromJson,
} from '@/lib/editor/template-coach'
import {
  appendDocumentChatMessage,
  listDocumentChatMessages,
} from '@/lib/db/api'
import {
  buildDocumentAskActions,
  buildDocumentAskQuestions,
} from '@/lib/library/document-ask-suggestions'
import {
  askDocument,
  documentChatContext,
  runDocumentChatAction,
  type DocumentChatAction,
} from '@/lib/library/library-chat'
import { documentQuestionHistory, type DocumentQuestionTurn } from '@/lib/library/document-question-history'
import { DocumentQuestionHistoryList } from '@/components/DocumentQuestionHistory'
import { MarkdownView } from '@/components/MarkdownView'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { getDisplayKeysForShortcut } from '@/lib/shortcuts'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  clearInsightsAskFocus,
  setActiveDocumentId,
  setDocumentOutlineOpen,
  setFindReplaceOpen,
  setPendingEditorSearch,
  setPendingLibraryView,
  setSidebarOpen,
} from '@/store/documentsSlice'
import { useMoveDocumentToFolder } from '@/hooks/useMoveDocumentToFolder'
import { useRenameDocument } from '@/hooks/useRenameDocument'
import { applySpellSuggestion, applyWikiSuggestion } from '@/lib/editor/apply-suggestions'
import { insertAiAnswerAsCallout } from '@/lib/editor/insert-ai-answer'
import { createLibraryFolder } from '@/lib/library/create-folder'
import {
  EditorSidePanel,
  EditorSidePanelEmpty,
  EditorSidePanelHeader,
  EditorSidePanelIconButton,
  EditorSidePanelList,
} from '@/components/editor/EditorSidePanelPrimitives'

type DocumentInsightsPanelProps = {
  onClose: () => void
}

const FALLBACK_INSIGHT_ACTIONS: DocumentChatAction[] = [
  'summarize',
  'outline',
  'quotes',
  'keywords',
  'tasks',
  'wiki',
  'mentions',
  'similar',
  'questions',
  'tone',
]

function InsightChip({
  children,
  className,
  title,
}: {
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span className={cn('insights-chip', className)} title={title}>
      {children}
    </span>
  )
}

function InsightSection({
  icon: Icon,
  title,
  count,
  defaultOpen,
  children,
  className,
}: {
  icon: typeof Sparkles
  title: string
  count?: number
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}) {
  const hasItems = (count ?? 0) > 0
  const [open, setOpen] = useState(defaultOpen ?? hasItems)

  useEffect(() => {
    if (hasItems) setOpen(true)
  }, [hasItems])

  return (
    <section className={cn('insights-section', open && 'is-open', className)}>
      <button
        type="button"
        className="insights-section__head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="insights-section__title">
          <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          {title}
        </span>
        <span className="insights-section__meta">
          {typeof count === 'number' ? (
            <span className={cn('insights-count', hasItems && 'has-items')}>{count}</span>
          ) : null}
          <ChevronDown className={cn('insights-section__chevron', open && 'is-open')} aria-hidden />
        </span>
      </button>
      {open ? <div className="insights-section__body">{children}</div> : null}
    </section>
  )
}

export function DocumentInsightsPanel({ onClose }: DocumentInsightsPanelProps) {
  const { t, i18n } = useTranslation()
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const activeSummary = useAppSelector((state) =>
    state.documents.documents.find((doc) => doc.id === state.documents.activeDocumentId),
  )
  const folders = useAppSelector((state) => state.folders.folders)
  const insightsFocusAsk = useAppSelector((state) => state.documents.insightsFocusAsk)
  const shortcutOverrides = useAppSelector((state) => state.settings.shortcutOverrides)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const moveDocument = useMoveDocumentToFolder()
  const renameDocument = useRenameDocument()
  const askInputRef = useRef<HTMLInputElement>(null)
  const [similar, setSimilar] = useState<SearchHit[]>([])
  const [tasks, setTasks] = useState<DocumentTask[]>([])
  const [analysis, setAnalysis] = useState<NlpDocumentAnalysis | null>(null)
  const [nlpEnabled, setNlpEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applyingTitle, setApplyingTitle] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [spellResult, setSpellResult] = useState<SpellcheckResult | null>(null)
  const [spellLoading, setSpellLoading] = useState(false)
  const [askInput, setAskInput] = useState('')
  const [askBusy, setAskBusy] = useState(false)
  const [askReply, setAskReply] = useState<string | null>(null)
  const [questionHistory, setQuestionHistory] = useState<DocumentQuestionTurn[]>([])
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null)
  const [folderSuggestion, setFolderSuggestion] = useState<string | null>(null)
  const [folderSuggestionId, setFolderSuggestionId] = useState<string | null>(null)
  const [templateHints, setTemplateHints] = useState<NlpTemplateFillHints | null>(null)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [vaultAnalyzeBusy, setVaultAnalyzeBusy] = useState(false)
  const [vaultDenied, setVaultDenied] = useState(false)
  const [wikiSuggestions, setWikiSuggestions] = useState<WikiLinkSuggestion[]>([])
  const [wikiBusyId, setWikiBusyId] = useState<string | null>(null)

  const askShortcutLabel = useMemo(
    () => getDisplayKeysForShortcut('askThisNote', shortcutOverrides).join(''),
    [shortcutOverrides],
  )

  useEffect(() => {
    if (!insightsFocusAsk || !nlpEnabled) return
    const timer = window.setTimeout(() => {
      askInputRef.current?.focus()
      askInputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      dispatch(clearInsightsAskFocus())
    }, 80)
    return () => window.clearTimeout(timer)
  }, [insightsFocusAsk, nlpEnabled, dispatch])

  const vaultFolder = useMemo(() => {
    const folderId = activeSummary?.folderId ?? activeDocument?.folderId
    if (!folderId) return null
    return folders.find((folder) => folder.id === folderId && folder.isVault) ?? null
  }, [activeDocument?.folderId, activeSummary?.folderId, folders])

  const vaultUnlockedPlaintext = useMemo(() => {
    if (!vaultFolder || !activeDocument?.contentJson) return null
    if (!isVaultUnlocked(vaultFolder.id)) return null
    if (isVaultCipherJson(activeDocument.contentJson)) return null
    const plain = tiptapToPlainText(activeDocument.contentJson).trim()
    return plain.length >= 8 ? `${activeDocument.title}\n${plain}` : null
  }, [activeDocument, vaultFolder])

  useEffect(() => {
    let cancelled = false
    if (!activeId) {
      setSimilar([])
      setTasks([])
      setAnalysis(null)
      setSpellResult(null)
      setAskReply(null)
      setQuestionHistory([])
      setSelectedQuestionId(null)
      setFolderSuggestion(null)
      setFolderSuggestionId(null)
      setTemplateHints(null)
      setWikiSuggestions([])
      setVaultDenied(false)
      return
    }
    const currentFolderId = activeSummary?.folderId ?? null
    setLoading(true)
    setVaultDenied(false)
    let analysisVaultError = false
    Promise.all([
      nlpStatus().catch(() => null),
      nlpSimilarDocuments(activeId, 8).catch(() => [] as SearchHit[]),
      nlpDocumentAnalysis(activeId).catch((error) => {
        const message = String(error)
        analysisVaultError =
          message.includes('vault') ||
          message.includes('access.vaultDenied') ||
          message.includes('Encrypted vault')
        return null
      }),
    ])
      .then(([status, similarHits, documentAnalysis]) => {
        if (cancelled) return
        setNlpEnabled(Boolean(status?.enabled))
        setSimilar(similarHits)
        setAnalysis(documentAnalysis)
        setVaultDenied(analysisVaultError)
        setLoading(false)
        if (!status?.enabled || !documentAnalysis) {
          setTasks([])
          setTemplateHints(null)
          setFolderSuggestion(null)
          setFolderSuggestionId(null)
          setWikiSuggestions([])
          return
        }
        void Promise.all([
          nlpDocumentTasks(activeId).catch(() => [] as DocumentTask[]),
          nlpSuggestTags(activeId).catch(() => null),
          nlpTemplateFillHints({
            documentId: activeId,
            expectedSections: expectedSectionsForTemplate(
              templateCoachFromJson(activeDocument?.contentJson)?.templateId,
            ),
          }).catch(() => null),
          nlpSuggestWikiLinks(activeId, 8).catch(() => [] as WikiLinkSuggestion[]),
        ]).then(([documentTasks, tags, template, wiki]) => {
          if (cancelled) return
          setTasks(documentTasks)
          const nextFolderId =
            tags?.folderSuggestionId && tags.folderSuggestionId !== currentFolderId
              ? tags.folderSuggestionId
              : null
          setFolderSuggestionId(nextFolderId)
          setFolderSuggestion(tags?.folderSuggestion?.trim() || null)
          setTemplateHints(template)
          setWikiSuggestions(wiki)
        })
      })
      .catch((error) => {
        if (!cancelled) toast.error(t('panels.insights.loadError'), String(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // activeSummary folder is snapshotted at load; move clears suggestion separately
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on document / refresh only
  }, [activeId, reloadKey, t])

  useEffect(() => {
    if (folderSuggestionId && activeSummary?.folderId === folderSuggestionId) {
      setFolderSuggestion(null)
      setFolderSuggestionId(null)
    }
  }, [activeSummary?.folderId, folderSuggestionId])

  const loadQuestionHistory = useCallback(async (documentId: string) => {
    try {
      const rows = await listDocumentChatMessages(documentId)
      setQuestionHistory(documentQuestionHistory(rows))
    } catch {
      setQuestionHistory([])
    }
  }, [])

  useEffect(() => {
    if (!activeId) return
    void loadQuestionHistory(activeId)
  }, [activeId, reloadKey, loadQuestionHistory])

  const openTasks = useMemo(
    () => tasks.filter((task) => !task.checked),
    [tasks],
  )

  const slovak = useMemo(
    () => (analysis?.language || i18n.language || '').toLowerCase().startsWith('sk'),
    [analysis?.language, i18n.language],
  )

  const documentQuestions = useMemo(
    () =>
      buildDocumentAskQuestions(analysis, openTasks, {
        title: activeDocument?.title || activeSummary?.title,
        slovak,
      }),
    [analysis, openTasks, activeDocument?.title, activeSummary?.title, slovak],
  )

  const documentActions = useMemo(() => {
    const ranked = buildDocumentAskActions(analysis, openTasks)
    return ranked.length > 0 ? ranked : FALLBACK_INSIGHT_ACTIONS
  }, [analysis, openTasks])

  const handleOpen = useCallback(
    (id: string) => {
      dispatch(setActiveDocumentId(id))
      navigate(ROUTES.document(id))
    },
    [dispatch, navigate],
  )

  const handleSpellcheck = useCallback(async () => {
    if (!activeId || !nlpEnabled) return
    setSpellLoading(true)
    try {
      const result = await nlpSpellcheck(activeId)
      setSpellResult(result)
    } catch (error) {
      setSpellResult(null)
      toast.error(t('panels.insights.spellcheckError'), String(error))
    } finally {
      setSpellLoading(false)
    }
  }, [activeId, nlpEnabled, t])

  const handleApplySuggestedTitle = useCallback(async () => {
    if (!activeId || !analysis?.suggestedTitle) return
    const next = analysis.suggestedTitle.trim()
    if (!next) return
    setApplyingTitle(true)
    try {
      await renameDocument(activeId, next)
      setAnalysis((prev) => (prev ? { ...prev, suggestedTitle: next } : prev))
    } finally {
      setApplyingTitle(false)
    }
  }, [activeId, analysis?.suggestedTitle, renameDocument])

  const handleTemplateCheck = useCallback(async () => {
    if (!activeId || !nlpEnabled) return
    setTemplateLoading(true)
    try {
      const coach = templateCoachFromJson(activeDocument?.contentJson)
      const result = await nlpTemplateFillHints({
        documentId: activeId,
        expectedSections: expectedSectionsForTemplate(coach?.templateId),
      })
      setTemplateHints(result)
    } catch (error) {
      setTemplateHints(null)
      toast.error(t('panels.insights.templateError'), String(error))
    } finally {
      setTemplateLoading(false)
    }
  }, [activeDocument?.contentJson, activeId, nlpEnabled, t])

  const handleMoveToSuggestedFolder = useCallback(async () => {
    if (!activeId || !folderSuggestionId) return
    await moveDocument(activeId, folderSuggestionId)
    setFolderSuggestion(null)
    setFolderSuggestionId(null)
  }, [activeId, folderSuggestionId, moveDocument])

  const handleCreateSuggestedFolder = useCallback(async () => {
    if (!activeId || !folderSuggestion) return
    try {
      const folder = await createLibraryFolder({ name: folderSuggestion }, dispatch)
      await moveDocument(activeId, folder.id)
      toast.success(t('toasts.folderCreated'), folder.name)
      setFolderSuggestion(null)
      setFolderSuggestionId(null)
    } catch (error) {
      toast.error(t('toasts.folderCreateError'), String(error))
    }
  }, [activeId, dispatch, folderSuggestion, moveDocument, t])

  const handleAnalyzeUnlockedVault = useCallback(async () => {
    if (!nlpEnabled || !vaultUnlockedPlaintext || vaultAnalyzeBusy) return
    setVaultAnalyzeBusy(true)
    try {
      const result = await nlpAnalyzePlaintext(vaultUnlockedPlaintext)
      setAnalysis(result)
      setVaultDenied(false)
      toast.success(t('panels.insights.vaultAnalyzeDone'))
    } catch (error) {
      toast.error(t('panels.insights.vaultAnalyzeError'), String(error))
    } finally {
      setVaultAnalyzeBusy(false)
    }
  }, [nlpEnabled, t, vaultAnalyzeBusy, vaultUnlockedPlaintext])

  const handleAskAction = useCallback(
    async (action: DocumentChatAction) => {
      if (!activeId || !nlpEnabled || askBusy) return
      setAskBusy(true)
      try {
        const label = t(`libraryChat.actions.${action}`)
        const result = await runDocumentChatAction(activeId, action)
        setAskReply(result.answer)
        await appendDocumentChatMessage({
          documentId: activeId,
          role: 'user',
          text: label,
          action,
        })
        await appendDocumentChatMessage({
          documentId: activeId,
          role: 'assistant',
          text: result.answer,
          citations: result.citations,
          action,
        })
        await loadQuestionHistory(activeId)
      } catch (error) {
        toast.error(t('libraryChat.errorTitle'), String(error))
      } finally {
        setAskBusy(false)
      }
    },
    [activeId, askBusy, loadQuestionHistory, nlpEnabled, t],
  )

  const handleAskQuestion = useCallback(async (raw?: string) => {
    const question = (raw ?? askInput).trim()
    if (!activeId || !nlpEnabled || !question || askBusy) return
    setAskBusy(true)
    try {
      const history = await listDocumentChatMessages(activeId)
      const context = documentChatContext(
        history.map((item) => ({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          text: item.text,
        })),
      )
      const result = await askDocument(activeId, question, context)
      setAskReply(result.answer)
      setAskInput('')
      setSelectedQuestionId(null)
      await appendDocumentChatMessage({
        documentId: activeId,
        role: 'user',
        text: question,
      })
      await appendDocumentChatMessage({
        documentId: activeId,
        role: 'assistant',
        text: result.answer,
        citations: result.citations,
      })
      await loadQuestionHistory(activeId)
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error)
      toast.error(
        t('libraryChat.errorTitle'),
        raw.startsWith('libraryChat.') || raw.startsWith('documentChat.') ? t(raw) : raw,
      )
    } finally {
      setAskBusy(false)
    }
  }, [activeId, askBusy, askInput, loadQuestionHistory, nlpEnabled, t])

  const handleSelectQuestion = useCallback((turn: DocumentQuestionTurn) => {
    setSelectedQuestionId(turn.id)
    setAskInput(turn.action ? '' : turn.question)
    setAskReply(turn.answer ?? null)
  }, [])

  const openLibraryChat = useCallback(() => {
    dispatch(setPendingLibraryView({ view: 'chat' }))
    dispatch(setSidebarOpen(true))
  }, [dispatch])

  const handleFindWord = useCallback(
    (word: string) => {
      dispatch(setFindReplaceOpen(true))
      dispatch(setPendingEditorSearch(word))
    },
    [dispatch],
  )

  const handleInsertAskReply = useCallback(() => {
    if (!askReply) return
    const ok = insertAiAnswerAsCallout(askReply, {
      sourceTitle: activeDocument?.title || t('panels.insights.askTitle'),
    })
    if (ok) toast.success(t('panels.insights.insertAnswerDone'))
    else toast.error(t('panels.insights.insertAnswerError'))
  }, [activeDocument?.title, askReply, t])

  const handleApplyWiki = useCallback(
    (suggestion: WikiLinkSuggestion) => {
      const key = `${suggestion.documentId}:${suggestion.phrase}`
      setWikiBusyId(key)
      const result = applyWikiSuggestion(suggestion)
      setWikiBusyId(null)
      if (result === 'failed') {
        toast.error(t('panels.insights.wikiApplyError'))
        return
      }
      toast.success(
        result === 'linked'
          ? t('panels.insights.wikiAppliedLinked', { title: suggestion.title })
          : t('panels.insights.wikiAppliedInserted', { title: suggestion.title }),
      )
      setWikiSuggestions((prev) =>
        prev.filter(
          (item) =>
            !(item.documentId === suggestion.documentId && item.phrase === suggestion.phrase),
        ),
      )
    },
    [t],
  )

  const handleApplySpell = useCallback(
    (word: string, suggestion: string) => {
      handleFindWord(word)
      window.setTimeout(() => {
        const ok = applySpellSuggestion(word, suggestion)
        if (ok) {
          toast.success(t('panels.insights.spellcheckApplied', { word: suggestion }))
          setSpellResult((prev) =>
            prev
              ? {
                  ...prev,
                  issues: prev.issues.filter((issue) => issue.word !== word),
                  issueCount: Math.max(0, prev.issueCount - 1),
                }
              : prev,
          )
        } else {
          toast.error(t('panels.insights.spellcheckApplyError'))
        }
      }, 80)
    },
    [handleFindWord, t],
  )

  const keywordCount = analysis?.keywords.length ?? 0
  const outlineCount = analysis?.outline.length ?? 0
  const dateCount = analysis?.dates?.length ?? 0
  const mentionCount =
    (analysis?.wikiLinks?.length ?? 0) +
    (analysis?.mentions?.length ?? 0) +
    (analysis?.hosts?.length ?? 0)
  const hasSummary = Boolean(analysis?.summary?.trim())
  const templateMissingCount = templateHints?.missing.length ?? 0
  const reportCoach = useMemo(
    () => templateCoachFromJson(activeDocument?.contentJson ?? null),
    [activeDocument?.contentJson],
  )
  const reportGapCount =
    (reportCoach?.missingHeadings.length ?? 0) + (reportCoach?.openChecklist.length ?? 0)
  const signalCount =
    similar.length +
    openTasks.length +
    keywordCount +
    outlineCount +
    dateCount +
    mentionCount +
    (hasSummary ? 1 : 0) +
    (spellResult?.issueCount ?? 0) +
    (folderSuggestionId ? 1 : 0) +
    templateMissingCount +
    reportGapCount +
    wikiSuggestions.length

  const languageLabel = useMemo(() => {
    if (!analysis?.language || analysis.language === 'unknown') {
      return t('panels.insights.languageUnknown')
    }
    if (analysis.language === 'sk') return t('panels.insights.languageSk')
    if (analysis.language === 'en') return t('panels.insights.languageEn')
    return analysis.language
  }, [analysis?.language, t])

  const toneLabel = useMemo(() => {
    const tone = analysis?.tone
    if (!tone) return null
    return t(`panels.insights.tone.${tone}`, { defaultValue: tone })
  }, [analysis?.tone, t])

  const readabilityLabel = useMemo(() => {
    const label = analysis?.readabilityLabel
    if (!label) return null
    return t(`panels.insights.readability.${label}`, { defaultValue: label })
  }, [analysis?.readabilityLabel, t])

  const readingMinutes = Math.max(1, Math.round(analysis?.readingTimeMinutes ?? 1))

  return (
    <EditorSidePanel className="titlebar-no-drag insights-panel" aria-label={t('panels.insights.title')}>
      <EditorSidePanelHeader
        title={t('panels.insights.title')}
        subtitle={
          signalCount > 0
            ? t('panels.insights.subtitleWithCount', { count: signalCount })
            : t('panels.insights.subtitle')
        }
        actions={
          <div className="inline-flex gap-0.5">
            <EditorSidePanelIconButton title={t('common.refresh')} onClick={() => setReloadKey((value) => value + 1)}>
              <RotateCcw className="h-4 w-4" />
            </EditorSidePanelIconButton>
            <EditorSidePanelIconButton aria-label={t('panels.insights.hide')} onClick={onClose}>
              <PanelRightClose className="h-4 w-4" />
            </EditorSidePanelIconButton>
          </div>
        }
      />

      {loading && signalCount === 0 && !askReply && questionHistory.length === 0 ? (
        <EditorSidePanelEmpty>{t('common.loading')}</EditorSidePanelEmpty>
      ) : (
        <EditorSidePanelList className="insights-panel__list">
          {nlpEnabled && (vaultDenied || vaultFolder) ? (
            <div className="insights-tool insights-rise" style={{ animationDelay: '20ms' }}>
              <div className="insights-tool__row">
                <div className="insights-tool__copy">
                  <Sparkles className="h-3.5 w-3.5 opacity-70" aria-hidden />
                  <div>
                    <div className="insights-tool__title">{t('panels.insights.vaultTitle')}</div>
                    <div className="insights-tool__hint">
                      {vaultUnlockedPlaintext
                        ? t('panels.insights.vaultUnlockedHint')
                        : t('panels.insights.vaultLockedHint')}
                    </div>
                  </div>
                </div>
              </div>
              {vaultUnlockedPlaintext ? (
                <button
                  type="button"
                  className="insights-primary-btn"
                  disabled={vaultAnalyzeBusy}
                  onClick={() => void handleAnalyzeUnlockedVault()}
                >
                  {vaultAnalyzeBusy ? (
                    <>
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      {t('panels.insights.vaultAnalyzeRunning')}
                    </>
                  ) : (
                    t('panels.insights.vaultAnalyze')
                  )}
                </button>
              ) : (
                <p className="insights-quiet">{t('panels.insights.vaultDenied')}</p>
              )}
            </div>
          ) : null}

          <div className="insights-ask insights-rise" style={{ animationDelay: '40ms' }}>
            <div className="insights-ask__label">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              <span>{t('panels.insights.askTitle')}</span>
              {askShortcutLabel ? (
                <kbd className="insights-ask__kbd">{askShortcutLabel}</kbd>
              ) : null}
              <span className="insights-ask__local">{t('panels.insights.localBadge')}</span>
            </div>

            {!nlpEnabled ? (
              <p className="insights-quiet">{t('panels.insights.keywordsDisabled')}</p>
            ) : (
              <>
                <p className="insights-ask__cta">{t('panels.insights.askCta')}</p>
                <p className="insights-ask__hint">{t('panels.insights.askHint')}</p>
                {documentQuestions.length > 0 ? (
                  <div className="insights-actions">
                    {documentQuestions.map((question) => (
                      <button
                        key={question}
                        type="button"
                        disabled={askBusy || !activeId}
                        className="insights-action insights-action--question"
                        onClick={() => void handleAskQuestion(question)}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="insights-actions">
                  {documentActions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      disabled={askBusy || !activeId}
                      className="insights-action"
                      onClick={() => void handleAskAction(action)}
                    >
                      {t(`libraryChat.actions.${action}`)}
                    </button>
                  ))}
                </div>

                <form
                  className="insights-ask__form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void handleAskQuestion()
                  }}
                >
                  <input
                    ref={askInputRef}
                    type="text"
                    className="insights-ask__input"
                    placeholder={t('libraryChat.placeholderDocument')}
                    value={askInput}
                    disabled={askBusy}
                    onChange={(event) => setAskInput(event.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={askBusy || !askInput.trim()}
                    className="insights-ask__send"
                    aria-label={t('libraryChat.send')}
                  >
                    {askBusy ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </button>
                </form>

                {askBusy && !askReply ? (
                  <p className="insights-quiet">{t('libraryChat.thinking')}</p>
                ) : null}
              </>
            )}

            {askReply ? (
              <div className="insights-reply">
                <MarkdownView source={askReply} headingIds={false} className="scribe-markdown--chat" />
                <button
                  type="button"
                  className="insights-primary-btn mt-2"
                  onClick={handleInsertAskReply}
                >
                  {t('panels.insights.insertAnswer')}
                </button>
              </div>
            ) : null}

            <DocumentQuestionHistoryList
              items={questionHistory}
              selectedId={selectedQuestionId}
              emptyHint={t('panels.insights.questionHistoryEmpty')}
              onSelect={handleSelectQuestion}
              onAskAgain={nlpEnabled ? (turn) => void handleAskQuestion(turn.question) : undefined}
              askAgainDisabled={askBusy}
            />

            <button type="button" className="insights-link" onClick={openLibraryChat}>
              {t('panels.insights.openChat')}
            </button>
          </div>

          <div className="insights-snapshot insights-rise" style={{ animationDelay: '90ms' }}>
            <div className="insights-snapshot__head">
              <Sparkles className="h-3.5 w-3.5 opacity-70" aria-hidden />
              <span>{t('panels.insights.summary')}</span>
            </div>

            {nlpEnabled ? (
              <div className="insights-chips">
                <InsightChip>
                  <Languages className="h-3 w-3" aria-hidden />
                  {languageLabel}
                </InsightChip>
                {toneLabel ? (
                  <InsightChip>
                    <Sparkles className="h-3 w-3" aria-hidden />
                    {toneLabel}
                  </InsightChip>
                ) : null}
                {readabilityLabel ? (
                  <InsightChip>
                    <Gauge className="h-3 w-3" aria-hidden />
                    {readabilityLabel}
                    <span className="opacity-60">· ~{readingMinutes} min</span>
                  </InsightChip>
                ) : null}
              </div>
            ) : null}

            {!nlpEnabled || !hasSummary ? (
              <p className="insights-quiet">
                {nlpEnabled ? t('panels.insights.summaryEmpty') : t('panels.insights.keywordsDisabled')}
              </p>
            ) : (
              <p className="insights-summary">{analysis?.summary}</p>
            )}

            {nlpEnabled && analysis?.suggestedTitle ? (
              <div className="insights-suggested-row">
                <p className="insights-suggested" title={analysis.suggestedTitle}>
                  {t('panels.insights.suggestedTitle', { title: analysis.suggestedTitle })}
                </p>
                {activeId && analysis.suggestedTitle.trim() !== (activeDocument?.title ?? '').trim() ? (
                  <button
                    type="button"
                    className="insights-suggested-apply"
                    disabled={applyingTitle}
                    onClick={() => void handleApplySuggestedTitle()}
                  >
                    {applyingTitle
                      ? t('common.loading')
                      : t('panels.insights.applySuggestedTitle')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="insights-tool insights-rise" style={{ animationDelay: '130ms' }}>
            <div className="insights-tool__row">
              <div className="insights-tool__copy">
                <SpellCheck className="h-3.5 w-3.5 opacity-70" aria-hidden />
                <div>
                  <div className="insights-tool__title">{t('panels.insights.spellcheck')}</div>
                  <div className="insights-tool__hint">{t('panels.insights.spellcheckHintShort')}</div>
                </div>
              </div>
              {spellResult ? (
                <span className={cn('insights-count', spellResult.issueCount > 0 && 'has-items')}>
                  {spellResult.issueCount}
                </span>
              ) : null}
            </div>

            {!nlpEnabled ? (
              <p className="insights-quiet">{t('panels.insights.spellcheckDisabled')}</p>
            ) : (
              <>
                <button
                  type="button"
                  className="insights-primary-btn"
                  disabled={spellLoading || !activeId}
                  onClick={() => void handleSpellcheck()}
                >
                  {spellLoading ? (
                    <>
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      {t('panels.insights.spellcheckRunning')}
                    </>
                  ) : (
                    t('panels.insights.spellcheckRun')
                  )}
                </button>

                {spellResult && spellResult.issueCount === 0 ? (
                  <p className="insights-quiet insights-quiet--ok">{t('panels.insights.spellcheckEmpty')}</p>
                ) : null}

                {spellResult && spellResult.issues.length > 0 ? (
                  <ul className="insights-issue-list">
                    {spellResult.issues.slice(0, 24).map((issue) => (
                      <li key={`${issue.word}-${issue.offset}`}>
                        <button
                          type="button"
                          className="insights-issue-word"
                          title={t('panels.insights.spellcheckFind')}
                          onClick={() => handleFindWord(issue.word)}
                        >
                          {issue.word}
                        </button>
                        {issue.suggestions.length > 0 ? (
                          <span className="insights-issue-suggestions">
                            {issue.suggestions.slice(0, 3).map((suggestion) => (
                              <button
                                key={`${issue.word}-${suggestion}`}
                                type="button"
                                className="insights-spell-fix"
                                title={t('panels.insights.spellcheckApply', { word: suggestion })}
                                onClick={() => handleApplySpell(issue.word, suggestion)}
                              >
                                {suggestion}
                              </button>
                            ))}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <div className="insights-tool insights-rise" style={{ animationDelay: '145ms' }}>
            <div className="insights-tool__row">
              <div className="insights-tool__copy">
                <FolderInput className="h-3.5 w-3.5 opacity-70" aria-hidden />
                <div>
                  <div className="insights-tool__title">{t('panels.insights.organize')}</div>
                  <div className="insights-tool__hint">{t('panels.insights.organizeHint')}</div>
                </div>
              </div>
              {folderSuggestionId ? (
                <span className="insights-count has-items">1</span>
              ) : null}
            </div>

            {!nlpEnabled ? (
              <p className="insights-quiet">{t('panels.insights.keywordsDisabled')}</p>
            ) : folderSuggestion && folderSuggestionId ? (
              <>
                <p className="insights-quiet mb-2">
                  {t('panels.insights.organizeSuggestion', { folder: folderSuggestion })}
                </p>
                <button
                  type="button"
                  className="insights-primary-btn"
                  onClick={() => void handleMoveToSuggestedFolder()}
                >
                  {t('panels.insights.organizeMove', { folder: folderSuggestion })}
                </button>
              </>
            ) : folderSuggestion ? (
              <>
                <p className="insights-quiet mb-2">
                  {t('panels.insights.organizeCreateHint', { folder: folderSuggestion })}
                </p>
                <button
                  type="button"
                  className="insights-primary-btn"
                  onClick={() => void handleCreateSuggestedFolder()}
                >
                  {t('panels.insights.organizeCreate', { folder: folderSuggestion })}
                </button>
              </>
            ) : (
              <p className="insights-quiet">{t('panels.insights.organizeEmpty')}</p>
            )}
          </div>

          <div className="insights-tool insights-rise" style={{ animationDelay: '155ms' }}>
            <div className="insights-tool__row">
              <div className="insights-tool__copy">
                <LayoutTemplate className="h-3.5 w-3.5 opacity-70" aria-hidden />
                <div>
                  <div className="insights-tool__title">{t('panels.insights.template')}</div>
                  <div className="insights-tool__hint">{t('panels.insights.templateHint')}</div>
                </div>
              </div>
              {templateHints ? (
                <span className={cn('insights-count', (templateMissingCount > 0 || reportGapCount > 0) && 'has-items')}>
                  {Math.round((templateHints.coverage ?? 0) * 100)}%
                </span>
              ) : reportGapCount > 0 ? (
                <span className="insights-count has-items">{reportGapCount}</span>
              ) : null}
            </div>

            {!nlpEnabled ? (
              <p className="insights-quiet">{t('panels.insights.keywordsDisabled')}</p>
            ) : (
              <>
                <button
                  type="button"
                  className="insights-primary-btn"
                  disabled={templateLoading || !activeId}
                  onClick={() => void handleTemplateCheck()}
                >
                  {templateLoading ? (
                    <>
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      {t('panels.insights.templateRunning')}
                    </>
                  ) : (
                    t('panels.insights.templateRun')
                  )}
                </button>

                {templateHints?.complete ? (
                  <p className="insights-quiet insights-quiet--ok">{t('panels.insights.templateComplete')}</p>
                ) : null}

                {templateHints && !templateHints.complete ? (
                  <>
                    <p className="insights-quiet mb-2">
                      {t('panels.insights.templateCoverage', {
                        percent: Math.round(templateHints.coverage * 100),
                      })}
                    </p>
                    {templateHints.missing.length > 0 ? (
                      <div className="insights-tag-row">
                        {templateHints.missing.slice(0, 8).map((section) => (
                          <InsightChip key={section} className="insights-chip--strong" title={section}>
                            {section}
                          </InsightChip>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}

                {reportCoach && reportGapCount > 0 ? (
                  <div className="insights-report-gaps">
                    {reportCoach.missingHeadings.length > 0 ? (
                      <>
                        <p className="insights-quiet mb-2">{t('templateCoach.missing')}</p>
                        <div className="insights-tag-row">
                          {reportCoach.missingHeadings.slice(0, 8).map((section) => (
                            <InsightChip key={`h-${section}`} className="insights-chip--strong" title={section}>
                              {section}
                            </InsightChip>
                          ))}
                        </div>
                      </>
                    ) : null}
                    {reportCoach.openChecklist.length > 0 ? (
                      <>
                        <p className="insights-quiet mb-2 mt-2">{t('templateCoach.checklistOpen')}</p>
                        <ul className="insights-task-list">
                          {reportCoach.openChecklist.slice(0, 6).map((item) => (
                            <li key={item}>
                              <Square className="mt-0.5 h-3 w-3 shrink-0 opacity-55" aria-hidden />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="insights-stack insights-rise" style={{ animationDelay: '170ms' }}>
            <InsightSection
              icon={CalendarDays}
              title={t('panels.insights.dates')}
              count={dateCount}
              defaultOpen={dateCount > 0}
            >
              {!nlpEnabled || dateCount === 0 ? (
                <p className="insights-quiet">
                  {nlpEnabled ? t('panels.insights.datesEmpty') : t('panels.insights.keywordsDisabled')}
                </p>
              ) : (
                <ul className="insights-plain-list">
                  {analysis?.dates?.slice(0, 8).map((item, index) => (
                    <li key={`${item.text}-${index}`}>
                      <span>{item.text}</span>
                      {item.resolvedDate ? (
                        <span className="insights-dim">→ {item.resolvedDate}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </InsightSection>

            <InsightSection
              icon={AtSign}
              title={t('panels.insights.links')}
              count={mentionCount + wikiSuggestions.length}
              defaultOpen={mentionCount > 0 || wikiSuggestions.length > 0}
            >
              {!nlpEnabled ? (
                <p className="insights-quiet">{t('panels.insights.keywordsDisabled')}</p>
              ) : (
                <>
                  {wikiSuggestions.length > 0 ? (
                    <div className="insights-wiki-suggest mb-3">
                      <p className="insights-quiet mb-2">{t('panels.insights.wikiSuggestHint')}</p>
                      <div className="insights-wiki-suggest__list">
                        {wikiSuggestions.map((item) => {
                          const key = `${item.documentId}:${item.phrase}`
                          return (
                            <div key={key} className="insights-wiki-suggest__row">
                              <span className="min-w-0">
                                <span className="insights-wiki-suggest__phrase">
                                  “{item.phrase}”
                                </span>
                                <span className="insights-wiki-suggest__title">
                                  → [[{item.title}]]
                                </span>
                              </span>
                              <button
                                type="button"
                                className="insights-action"
                                disabled={wikiBusyId === key}
                                onClick={() => handleApplyWiki(item)}
                              >
                                {t('panels.insights.wikiAccept')}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                  {mentionCount === 0 && wikiSuggestions.length === 0 ? (
                    <p className="insights-quiet">{t('panels.insights.linksEmpty')}</p>
                  ) : mentionCount > 0 ? (
                    <div className="insights-tag-row">
                      {analysis?.wikiLinks?.slice(0, 6).map((item) => (
                        <InsightChip key={`wiki-${item}`}>[[{item}]]</InsightChip>
                      ))}
                      {analysis?.mentions?.slice(0, 6).map((item) => (
                        <InsightChip key={`mention-${item}`}>@{item}</InsightChip>
                      ))}
                      {analysis?.hosts?.slice(0, 4).map((item) => (
                        <InsightChip key={`host-${item}`}>{item}</InsightChip>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </InsightSection>

            <InsightSection
              icon={Hash}
              title={t('panels.insights.keywords')}
              count={keywordCount}
              defaultOpen={keywordCount > 0}
            >
              {!nlpEnabled || keywordCount === 0 ? (
                <p className="insights-quiet">
                  {nlpEnabled ? t('panels.insights.keywordsEmpty') : t('panels.insights.keywordsDisabled')}
                </p>
              ) : (
                <div className="insights-tag-row">
                  {analysis?.keywords.slice(0, 10).map((item) => (
                    <InsightChip key={item.term} className="insights-chip--strong" title={`${item.count}×`}>
                      {item.term}
                    </InsightChip>
                  ))}
                </div>
              )}
            </InsightSection>

            <InsightSection
              icon={ListTree}
              title={t('panels.insights.outline')}
              count={outlineCount}
              defaultOpen={false}
            >
              <p className="insights-quiet mb-2">{t('panels.insights.outlineOpenHint')}</p>
              <button
                type="button"
                className="insights-hit"
                onClick={() => {
                  onClose()
                  dispatch(setDocumentOutlineOpen(true))
                }}
              >
                <ListTree className="h-4 w-4 shrink-0 opacity-55" aria-hidden />
                <span className="insights-hit__title">{t('panels.insights.outlineOpenPanel')}</span>
              </button>
            </InsightSection>

            <InsightSection
              icon={Network}
              title={t('panels.insights.similar')}
              count={similar.length}
              defaultOpen={similar.length > 0}
            >
              <p className="insights-quiet mb-2">
                {nlpEnabled ? t('panels.insights.similarHint') : t('panels.insights.similarDisabled')}
              </p>
              {similar.length === 0 ? (
                <p className="insights-quiet">{t('panels.insights.similarEmpty')}</p>
              ) : (
                <div className="insights-hit-list">
                  {similar.map((hit) => (
                    <button
                      key={hit.documentId}
                      type="button"
                      className="insights-hit"
                      onClick={() => handleOpen(hit.documentId)}
                      title={hit.title}
                    >
                      <FileText className="h-4 w-4 shrink-0 opacity-55" aria-hidden />
                      <span className="min-w-0">
                        <span className="insights-hit__title">{hit.title || t('common.untitled')}</span>
                        <span className="insights-hit__snippet">{hit.snippet}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </InsightSection>

            <InsightSection
              icon={CheckSquare}
              title={t('panels.insights.tasks')}
              count={openTasks.length}
              defaultOpen={openTasks.length > 0}
            >
              <p className="insights-quiet mb-2">{t('panels.insights.tasksHint')}</p>
              {openTasks.length === 0 ? (
                <p className="insights-quiet">{t('panels.insights.tasksEmpty')}</p>
              ) : (
                <div className="insights-task-list">
                  {openTasks.map((task, index) => (
                    <div key={`${task.text}-${index}`} className="insights-task">
                      <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="insights-task__text">{task.text}</span>
                        <span className="insights-task__meta">
                          <span
                            className={cn(
                              'insights-source',
                              task.source === 'phrase' && 'insights-source--phrase',
                            )}
                          >
                            {task.source === 'checkbox'
                              ? t('panels.insights.sourceCheckbox')
                              : t('panels.insights.sourcePhrase')}
                          </span>
                          {task.dueHint ? (
                            <span>{t('panels.insights.dueHint', { date: task.dueHint })}</span>
                          ) : null}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </InsightSection>
          </div>
        </EditorSidePanelList>
      )}
    </EditorSidePanel>
  )
}
