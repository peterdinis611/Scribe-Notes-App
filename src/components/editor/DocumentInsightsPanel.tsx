import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import {
  AtSign,
  CalendarDays,
  CheckSquare,
  FileText,
  Gauge,
  Hash,
  Languages,
  ListTree,
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
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId, setFindReplaceOpen, setPendingEditorSearch } from '@/store/documentsSlice'
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

  useEffect(() => {
    let cancelled = false
    if (!activeId) {
      setSimilar([])
      setTasks([])
      setAnalysis(null)
      setSpellResult(null)
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
  const total =
    similar.length +
    openTasks.length +
    keywordCount +
    outlineCount +
    dateCount +
    mentionCount +
    (hasSummary ? 1 : 0)

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

  return (
    <EditorSidePanel className="titlebar-no-drag" aria-label={t('panels.insights.title')}>
      <EditorSidePanelHeader
        title={t('panels.insights.title')}
        subtitle={
          total === 0
            ? t('panels.insights.subtitle')
            : `${t('panels.insights.subtitle')} · ${total}`
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

      {loading && total === 0 ? (
        <EditorSidePanelEmpty>{t('common.loading')}</EditorSidePanelEmpty>
      ) : (
        <EditorSidePanelList className="gap-1">
          <div>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
              <Sparkles className="h-3.5 w-3.5" />
              {t('panels.insights.summary')}
            </h3>
            <p className="m-0 mb-1.5 flex items-center gap-1.5 text-[10.5px] text-[var(--color-muted-foreground)]">
              <Languages className="h-3 w-3 shrink-0" />
              {nlpEnabled
                ? t('panels.insights.languageLine', { language: languageLabel })
                : t('panels.insights.keywordsDisabled')}
            </p>
            {!nlpEnabled || !hasSummary ? (
              <p className="m-0 mt-0.5 text-[11.5px] text-[var(--color-muted-foreground)]">
                {nlpEnabled ? t('panels.insights.summaryEmpty') : t('panels.insights.keywordsDisabled')}
              </p>
            ) : (
              <p className="m-0 text-[12.5px] leading-snug text-[var(--color-foreground)]">
                {analysis?.summary}
              </p>
            )}
            {nlpEnabled && (toneLabel || readabilityLabel || analysis?.suggestedTitle) && (
              <div className="mt-2 flex flex-col gap-1 text-[10.5px] text-[var(--color-muted-foreground)]">
                {toneLabel && (
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 shrink-0" />
                    {t('panels.insights.toneLine', { tone: toneLabel })}
                  </span>
                )}
                {readabilityLabel && (
                  <span className="inline-flex items-center gap-1.5">
                    <Gauge className="h-3 w-3 shrink-0" />
                    {t('panels.insights.readabilityLine', {
                      label: readabilityLabel,
                      minutes: Math.max(1, Math.round(analysis?.readingTimeMinutes ?? 1)),
                    })}
                  </span>
                )}
                {analysis?.suggestedTitle && (
                  <span className="truncate" title={analysis.suggestedTitle}>
                    {t('panels.insights.suggestedTitle', { title: analysis.suggestedTitle })}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="mt-3.5 border-t border-[var(--color-border)] pt-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
              <SpellCheck className="h-3.5 w-3.5" />
              {t('panels.insights.spellcheck')}
              {spellResult ? (
                <span className="ml-auto rounded-full bg-[var(--color-hover)] px-1.5 text-[10px] font-semibold">
                  {spellResult.issueCount}
                </span>
              ) : null}
            </h3>
            <p className="m-0 mb-2 text-[10.5px] leading-snug text-[var(--color-muted-foreground)]">
              {t('panels.insights.spellcheckHint')}
            </p>
            {!nlpEnabled ? (
              <p className="m-0 text-[11.5px] text-[var(--color-muted-foreground)]">
                {t('panels.insights.spellcheckDisabled')}
              </p>
            ) : (
              <>
                <button
                  type="button"
                  className="mb-2 inline-flex h-7 items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-[11px] font-medium text-[var(--color-foreground)] hover:bg-[var(--color-hover)]"
                  disabled={spellLoading || !activeId}
                  onClick={() => void handleSpellcheck()}
                >
                  {spellLoading
                    ? t('panels.insights.spellcheckRunning')
                    : t('panels.insights.spellcheckRun')}
                </button>
                {spellResult && spellResult.issueCount === 0 ? (
                  <p className="m-0 text-[11.5px] text-[var(--color-muted-foreground)]">
                    {t('panels.insights.spellcheckEmpty')}
                  </p>
                ) : null}
                {spellResult && spellResult.issues.length > 0 ? (
                  <ul className="m-0 list-none space-y-2 p-0">
                    {spellResult.issues.slice(0, 24).map((issue) => (
                      <li key={`${issue.word}-${issue.offset}`} className="text-[12px]">
                        <button
                          type="button"
                          className="font-semibold text-[var(--color-accent)] hover:underline"
                          title={t('panels.insights.spellcheckFind')}
                          onClick={() => handleFindWord(issue.word)}
                        >
                          {issue.word}
                        </button>
                        {issue.suggestions.length > 0 ? (
                          <span className="mt-0.5 block text-[10.5px] text-[var(--color-muted-foreground)]">
                            {t('panels.insights.spellcheckSuggestions', {
                              list: issue.suggestions.slice(0, 4).join(', '),
                            })}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <div className="mt-3.5 border-t border-[var(--color-border)] pt-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
              <CalendarDays className="h-3.5 w-3.5" />
              {t('panels.insights.dates')}
              <span className="ml-auto rounded-full bg-[var(--color-hover)] px-1.5 text-[10px] font-semibold">
                {dateCount}
              </span>
            </h3>
            {!nlpEnabled || dateCount === 0 ? (
              <p className="m-0 mt-0.5 text-[11.5px] text-[var(--color-muted-foreground)]">
                {nlpEnabled ? t('panels.insights.datesEmpty') : t('panels.insights.keywordsDisabled')}
              </p>
            ) : (
              <ul className="m-0 list-none space-y-1 p-0">
                {analysis?.dates?.slice(0, 8).map((item, index) => (
                  <li key={`${item.text}-${index}`} className="text-[12px] text-[var(--color-foreground)]">
                    {item.text}
                    {item.resolvedDate ? (
                      <span className="ml-1.5 text-[10px] text-[var(--color-muted-foreground)]">
                        → {item.resolvedDate}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3.5 border-t border-[var(--color-border)] pt-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
              <AtSign className="h-3.5 w-3.5" />
              {t('panels.insights.links')}
              <span className="ml-auto rounded-full bg-[var(--color-hover)] px-1.5 text-[10px] font-semibold">
                {mentionCount}
              </span>
            </h3>
            {!nlpEnabled || mentionCount === 0 ? (
              <p className="m-0 mt-0.5 text-[11.5px] text-[var(--color-muted-foreground)]">
                {nlpEnabled ? t('panels.insights.linksEmpty') : t('panels.insights.keywordsDisabled')}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {analysis?.wikiLinks?.slice(0, 6).map((item) => (
                  <span
                    key={`wiki-${item}`}
                    className="rounded-md bg-[var(--color-hover)] px-2 py-1 text-[11px] font-medium"
                  >
                    [[{item}]]
                  </span>
                ))}
                {analysis?.mentions?.slice(0, 6).map((item) => (
                  <span
                    key={`mention-${item}`}
                    className="rounded-md bg-[var(--color-hover)] px-2 py-1 text-[11px] font-medium"
                  >
                    @{item}
                  </span>
                ))}
                {analysis?.hosts?.slice(0, 4).map((item) => (
                  <span
                    key={`host-${item}`}
                    className="rounded-md bg-[var(--color-hover)] px-2 py-1 text-[11px] font-medium"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3.5 border-t border-[var(--color-border)] pt-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
              <Hash className="h-3.5 w-3.5" />
              {t('panels.insights.keywords')}
              <span className="ml-auto rounded-full bg-[var(--color-hover)] px-1.5 text-[10px] font-semibold">
                {keywordCount}
              </span>
            </h3>
            {!nlpEnabled || keywordCount === 0 ? (
              <p className="m-0 mt-0.5 text-[11.5px] text-[var(--color-muted-foreground)]">
                {nlpEnabled ? t('panels.insights.keywordsEmpty') : t('panels.insights.keywordsDisabled')}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {analysis?.keywords.slice(0, 10).map((item) => (
                  <span
                    key={item.term}
                    className="rounded-md bg-[var(--color-hover)] px-2 py-1 text-[11px] font-medium text-[var(--color-foreground)]"
                    title={`${item.count}×`}
                  >
                    {item.term}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3.5 border-t border-[var(--color-border)] pt-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
              <ListTree className="h-3.5 w-3.5" />
              {t('panels.insights.outline')}
              <span className="ml-auto rounded-full bg-[var(--color-hover)] px-1.5 text-[10px] font-semibold">
                {outlineCount}
              </span>
            </h3>
            {!nlpEnabled || outlineCount === 0 ? (
              <p className="m-0 mt-0.5 text-[11.5px] text-[var(--color-muted-foreground)]">
                {nlpEnabled ? t('panels.insights.outlineEmpty') : t('panels.insights.keywordsDisabled')}
              </p>
            ) : (
              <ul className="m-0 list-none space-y-1 p-0">
                {analysis?.outline.slice(0, 12).map((item, index) => (
                  <li
                    key={`${item.title}-${index}`}
                    className="truncate text-[12px] text-[var(--color-foreground)]"
                    style={{ paddingLeft: `${Math.max(0, item.level - 1) * 10}px` }}
                    title={item.title}
                  >
                    {item.title}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3.5 border-t border-[var(--color-border)] pt-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
              <Sparkles className="h-3.5 w-3.5" />
              {t('panels.insights.similar')}
              <span className="ml-auto rounded-full bg-[var(--color-hover)] px-1.5 text-[10px] font-semibold">
                {similar.length}
              </span>
            </h3>
            <p className="m-0 mb-1.5 text-[10.5px] text-[var(--color-muted-foreground)]">
              {nlpEnabled ? t('panels.insights.similarHint') : t('panels.insights.similarDisabled')}
            </p>
            {similar.length === 0 ? (
              <p className="m-0 mt-0.5 text-[11.5px] text-[var(--color-muted-foreground)]">
                {t('panels.insights.similarEmpty')}
              </p>
            ) : (
              similar.map((hit) => (
                <button
                  key={hit.documentId}
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-[9px] border border-transparent bg-transparent px-2.5 py-2 text-left transition-[background,border-color] duration-120 hover:border-[var(--color-border)] hover:bg-[var(--color-surface-elevated)]"
                  onClick={() => handleOpen(hit.documentId)}
                  title={hit.title}
                >
                  <FileText className="h-4 w-4 shrink-0 opacity-60" />
                  <span className="flex min-w-0 flex-col gap-px">
                    <span className="truncate text-[12.5px] font-medium text-[var(--color-foreground)]">
                      {hit.title || t('common.untitled')}
                    </span>
                    <span className="truncate text-[10.5px] text-[var(--color-muted-foreground)]">
                      {hit.snippet}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="mt-3.5 border-t border-[var(--color-border)] pt-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
              <CheckSquare className="h-3.5 w-3.5" />
              {t('panels.insights.tasks')}
              <span className="ml-auto rounded-full bg-[var(--color-hover)] px-1.5 text-[10px] font-semibold">
                {openTasks.length}
              </span>
            </h3>
            <p className="m-0 mb-1.5 text-[10.5px] text-[var(--color-muted-foreground)]">
              {t('panels.insights.tasksHint')}
            </p>
            {openTasks.length === 0 ? (
              <p className="m-0 mt-0.5 text-[11.5px] text-[var(--color-muted-foreground)]">
                {t('panels.insights.tasksEmpty')}
              </p>
            ) : (
              openTasks.map((task, index) => (
                <div
                  key={`${task.text}-${index}`}
                  className="flex items-start gap-2 rounded-[9px] px-2.5 py-2 text-left"
                >
                  <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] leading-snug text-[var(--color-foreground)]">
                      {task.text}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--color-muted-foreground)]">
                      <span
                        className={cn(
                          'rounded px-1 py-px uppercase tracking-wide',
                          task.source === 'checkbox'
                            ? 'bg-[var(--color-hover)]'
                            : 'bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-hover))]',
                        )}
                      >
                        {task.source === 'checkbox'
                          ? t('panels.insights.sourceCheckbox')
                          : t('panels.insights.sourcePhrase')}
                      </span>
                      {task.dueHint && (
                        <span>{t('panels.insights.dueHint', { date: task.dueHint })}</span>
                      )}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        </EditorSidePanelList>
      )}
    </EditorSidePanel>
  )
}
