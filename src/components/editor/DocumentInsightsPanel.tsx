import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowUpRight,
  AtSign,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  FileText,
  Gauge,
  Hash,
  Languages,
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
  nlpDocumentAnalysis,
  nlpDocumentTasks,
  nlpSimilarDocuments,
  nlpSpellcheck,
  nlpStatus,
  type DocumentTask,
  type NlpDocumentAnalysis,
  type SpellcheckResult,
} from '@/lib/db/nlp-api'
import {
  appendDocumentChatMessage,
  listDocumentChatMessages,
} from '@/lib/db/api'
import {
  askDocument,
  runDocumentChatAction,
  type DocumentChatAction,
} from '@/lib/library/library-chat'
import { MarkdownView } from '@/components/MarkdownView'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocumentId,
  setFindReplaceOpen,
  setPendingEditorSearch,
  setPendingLibraryView,
} from '@/store/documentsSlice'
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

const INSIGHT_ACTIONS: DocumentChatAction[] = [
  'summarize',
  'outline',
  'keywords',
  'tasks',
  'wiki',
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
  const { t } = useTranslation()
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [similar, setSimilar] = useState<SearchHit[]>([])
  const [tasks, setTasks] = useState<DocumentTask[]>([])
  const [analysis, setAnalysis] = useState<NlpDocumentAnalysis | null>(null)
  const [nlpEnabled, setNlpEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [spellResult, setSpellResult] = useState<SpellcheckResult | null>(null)
  const [spellLoading, setSpellLoading] = useState(false)
  const [askInput, setAskInput] = useState('')
  const [askBusy, setAskBusy] = useState(false)
  const [askReply, setAskReply] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!activeId) {
      setSimilar([])
      setTasks([])
      setAnalysis(null)
      setSpellResult(null)
      setAskReply(null)
      return
    }
    setLoading(true)
    Promise.all([
      nlpStatus().catch(() => null),
      nlpSimilarDocuments(activeId, 8).catch(() => [] as SearchHit[]),
      nlpDocumentTasks(activeId).catch(() => [] as DocumentTask[]),
      nlpDocumentAnalysis(activeId).catch(() => null),
    ])
      .then(([status, similarHits, documentTasks, documentAnalysis]) => {
        if (cancelled) return
        setNlpEnabled(Boolean(status?.enabled))
        setSimilar(similarHits)
        setTasks(documentTasks)
        setAnalysis(documentAnalysis)
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
  }, [activeId, reloadKey, t])

  const openTasks = useMemo(
    () => tasks.filter((task) => !task.checked),
    [tasks],
  )

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
      } catch (error) {
        toast.error(t('libraryChat.errorTitle'), String(error))
      } finally {
        setAskBusy(false)
      }
    },
    [activeId, askBusy, nlpEnabled, t],
  )

  const handleAskQuestion = useCallback(async () => {
    const question = askInput.trim()
    if (!activeId || !nlpEnabled || !question || askBusy) return
    setAskBusy(true)
    try {
      const history = await listDocumentChatMessages(activeId)
      const context = history.slice(-8).map((item) => ({ role: item.role, text: item.text }))
      const result = await askDocument(activeId, question, context)
      setAskReply(result.answer)
      setAskInput('')
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
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error)
      toast.error(
        t('libraryChat.errorTitle'),
        raw.startsWith('libraryChat.') || raw.startsWith('documentChat.') ? t(raw) : raw,
      )
    } finally {
      setAskBusy(false)
    }
  }, [activeId, askBusy, askInput, nlpEnabled, t])

  const openLibraryChat = useCallback(() => {
    dispatch(setPendingLibraryView({ view: 'chat' }))
  }, [dispatch])

  const handleFindWord = useCallback(
    (word: string) => {
      dispatch(setFindReplaceOpen(true))
      dispatch(setPendingEditorSearch(word))
    },
    [dispatch],
  )

  const keywordCount = analysis?.keywords.length ?? 0
  const outlineCount = analysis?.outline.length ?? 0
  const dateCount = analysis?.dates?.length ?? 0
  const mentionCount =
    (analysis?.wikiLinks?.length ?? 0) +
    (analysis?.mentions?.length ?? 0) +
    (analysis?.hosts?.length ?? 0)
  const hasSummary = Boolean(analysis?.summary?.trim())
  const signalCount =
    similar.length +
    openTasks.length +
    keywordCount +
    outlineCount +
    dateCount +
    mentionCount +
    (hasSummary ? 1 : 0) +
    (spellResult?.issueCount ?? 0)

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

      {loading && signalCount === 0 && !askReply ? (
        <EditorSidePanelEmpty>{t('common.loading')}</EditorSidePanelEmpty>
      ) : (
        <EditorSidePanelList className="insights-panel__list">
          <div className="insights-ask insights-rise" style={{ animationDelay: '40ms' }}>
            <div className="insights-ask__label">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              <span>{t('panels.insights.askTitle')}</span>
              <span className="insights-ask__local">{t('panels.insights.localBadge')}</span>
            </div>

            {!nlpEnabled ? (
              <p className="insights-quiet">{t('panels.insights.keywordsDisabled')}</p>
            ) : (
              <>
                <div className="insights-actions">
                  {INSIGHT_ACTIONS.map((action) => (
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

                {askReply ? (
                  <div className="insights-reply">
                    <MarkdownView source={askReply} className="scribe-markdown--chat" />
                  </div>
                ) : null}

                <button type="button" className="insights-link" onClick={openLibraryChat}>
                  {t('panels.insights.openChat')}
                </button>
              </>
            )}
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
              <p className="insights-suggested" title={analysis.suggestedTitle}>
                {t('panels.insights.suggestedTitle', { title: analysis.suggestedTitle })}
              </p>
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
                            {issue.suggestions.slice(0, 3).join(' · ')}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
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
              count={mentionCount}
              defaultOpen={mentionCount > 0}
            >
              {!nlpEnabled || mentionCount === 0 ? (
                <p className="insights-quiet">
                  {nlpEnabled ? t('panels.insights.linksEmpty') : t('panels.insights.keywordsDisabled')}
                </p>
              ) : (
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
              defaultOpen={outlineCount > 0}
            >
              {!nlpEnabled || outlineCount === 0 ? (
                <p className="insights-quiet">
                  {nlpEnabled ? t('panels.insights.outlineEmpty') : t('panels.insights.keywordsDisabled')}
                </p>
              ) : (
                <ul className="insights-plain-list">
                  {analysis?.outline.slice(0, 12).map((item, index) => (
                    <li
                      key={`${item.title}-${index}`}
                      className="truncate"
                      style={{ paddingLeft: `${Math.max(0, item.level - 1) * 10}px` }}
                      title={item.title}
                    >
                      {item.title}
                    </li>
                  ))}
                </ul>
              )}
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
