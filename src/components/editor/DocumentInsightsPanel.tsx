import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import {
  CheckSquare,
  FileText,
  PanelRightClose,
  RotateCcw,
  Sparkles,
  Square,
} from 'lucide-react'
import type { SearchHit } from '@/lib/db/api'
import {
  nlpDocumentTasks,
  nlpSimilarDocuments,
  nlpStatus,
  type DocumentTask,
} from '@/lib/db/nlp-api'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId } from '@/store/documentsSlice'
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
  const [nlpEnabled, setNlpEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!activeId) {
      setSimilar([])
      setTasks([])
      return
    }
    setLoading(true)
    Promise.all([
      nlpStatus().catch(() => null),
      nlpSimilarDocuments(activeId, 8).catch(() => [] as SearchHit[]),
      nlpDocumentTasks(activeId).catch(() => [] as DocumentTask[]),
    ])
      .then(([status, similarHits, documentTasks]) => {
        if (cancelled) return
        setNlpEnabled(Boolean(status?.enabled))
        setSimilar(similarHits)
        setTasks(documentTasks)
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

  const total = similar.length + openTasks.length

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
