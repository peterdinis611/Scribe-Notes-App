import {
  Columns2,
  FileText,
  LayoutGrid,
  ListTree,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  Rows2,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  IconTooltip,
} from '@/components/ui/tooltip'
import { countWords } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setPrintLayoutColumns,
  setPrintLayoutEnabled,
  setPrintZoom,
} from '@/store/settingsSlice'
import { EditorPagination } from '@/components/EditorPagination'
import { templateCoachFromJson } from '@/lib/editor/template-coach'
import { nlpStatus, type NlpStatus } from '@/lib/db/nlp-api'
import { runNlpIndexAllWithProgress } from '@/lib/nlp/index-progress'
import { toast } from '@/lib/toast'

type EditorStatusBarProps = {
  currentPage: number
  pageCount: number
  onPageChange: (page: number) => void
  onPrint: () => void
  onOpenPageSetup: () => void
  sectionLabel?: string | null
  onOpenOutline?: () => void
}

export function EditorStatusBar({
  currentPage,
  pageCount,
  onPageChange,
  onPrint,
  onOpenPageSetup,
  sectionLabel = null,
  onOpenOutline,
}: EditorStatusBarProps) {
  const { t } = useTranslation()
  const document = useAppSelector((state) => state.documents.activeDocument)
  const printLayoutEnabled = useAppSelector((state) => state.settings.printLayoutEnabled)
  const printZoom = useAppSelector((state) => state.settings.printZoom)
  const printColumns = useAppSelector((state) => state.settings.printLayoutColumns)
  const dispatch = useAppDispatch()

  const words = document ? countWords(document.contentJson) : 0
  const templateCoverage = templateCoachFromJson(document?.contentJson ?? null)
  const coachIncomplete =
    templateCoverage != null && templateCoverage.present < templateCoverage.expected
  const [nlp, setNlp] = useState<NlpStatus | null>(null)
  const [reindexing, setReindexing] = useState(false)

  const refreshNlp = useCallback(() => {
    void nlpStatus()
      .then(setNlp)
      .catch(() => setNlp(null))
  }, [])

  useEffect(() => {
    refreshNlp()
    const id = window.setInterval(refreshNlp, 30_000)
    return () => window.clearInterval(id)
  }, [refreshNlp])

  async function reindexNlp() {
    if (reindexing) return
    setReindexing(true)
    try {
      const result = await runNlpIndexAllWithProgress(() => undefined)
      toast.success(t('editor.nlp.reindexed', { count: result.indexed }))
      refreshNlp()
    } catch (error) {
      toast.error(t('editor.nlp.reindexError'), String(error))
    } finally {
      setReindexing(false)
    }
  }

  function adjustZoom(delta: number) {
    const next = Math.min(1, Math.max(0.5, Number((printZoom + delta).toFixed(2))))
    dispatch(setPrintZoom(next))
  }

  const nlpLabel = !nlp
    ? null
    : !nlp.enabled
      ? t('editor.nlp.off')
      : nlp.indexStale
        ? t('editor.nlp.stale', { count: nlp.staleIndexCount || nlp.indexedCount })
        : t('editor.nlp.ready', { count: nlp.indexedCount })

  return (
    <TooltipProvider delayDuration={400}>
      <footer className="editor-status-bar titlebar-no-drag" data-tour="status-bar">
        <div className="editor-status-bar-left">
          <div className="editor-status-cluster" role="group" aria-label={t('printLayout.pageLayout')}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn('editor-status-icon-btn', printLayoutEnabled && 'is-active')}
                  aria-pressed={printLayoutEnabled}
                  aria-label={t('printLayout.pageLayout')}
                  onClick={() => dispatch(setPrintLayoutEnabled(!printLayoutEnabled))}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('printLayout.pageLayoutHint')}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="editor-status-icon-btn"
                  aria-label={t('printLayout.pageSetup')}
                  onClick={onOpenPageSetup}
                >
                  <FileText className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('printLayout.pageSetupHint')}</TooltipContent>
            </Tooltip>
          </div>

          {printLayoutEnabled && (
            <>
              <div className="editor-status-divider" aria-hidden="true" />
              <div
                className="editor-status-segmented"
                role="group"
                aria-label={t('printLayout.preview')}
              >
                <IconTooltip label={t('printLayout.oneColumn')}>
                  <button
                    type="button"
                    className={cn('editor-status-segment', printColumns === 1 && 'is-active')}
                    aria-label={t('printLayout.oneColumn')}
                    aria-pressed={printColumns === 1}
                    onClick={() => dispatch(setPrintLayoutColumns(1))}
                  >
                    <Rows2 className="h-3.5 w-3.5" />
                  </button>
                </IconTooltip>
                <IconTooltip label={t('printLayout.twoColumns')}>
                  <button
                    type="button"
                    className={cn('editor-status-segment', printColumns === 2 && 'is-active')}
                    aria-label={t('printLayout.twoColumns')}
                    aria-pressed={printColumns === 2}
                    onClick={() => dispatch(setPrintLayoutColumns(2))}
                  >
                    <Columns2 className="h-3.5 w-3.5" />
                  </button>
                </IconTooltip>
              </div>
              <div className="editor-status-zoom">
                <IconTooltip label={t('printLayout.zoomOut')}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    aria-label={t('printLayout.zoomOut')}
                    onClick={() => adjustZoom(-0.1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                </IconTooltip>
                <span aria-live="polite">{Math.round(printZoom * 100)}%</span>
                <IconTooltip label={t('printLayout.zoomIn')}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    aria-label={t('printLayout.zoomIn')}
                    onClick={() => adjustZoom(0.1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </IconTooltip>
              </div>
            </>
          )}
        </div>

        <div className="editor-status-bar-center">
          {sectionLabel && onOpenOutline ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="editor-status-section"
                  onClick={onOpenOutline}
                  aria-label={`${t('panels.outline.youAreHere')}: ${sectionLabel}`}
                >
                  <ListTree className="editor-status-section-icon" aria-hidden="true" />
                  <span className="editor-status-section-title">{sectionLabel}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('panels.outline.youAreHereHint')}</TooltipContent>
            </Tooltip>
          ) : null}
          <EditorPagination
            currentPage={currentPage}
            pageCount={pageCount}
            onPageChange={onPageChange}
            mode="summary"
          />
        </div>

        <div className="editor-status-bar-right">
          {nlpLabel ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'editor-status-meta inline-flex items-center gap-1',
                    nlp?.indexStale && 'editor-status-meta--coach',
                  )}
                  disabled={reindexing || !nlp?.enabled}
                  onClick={() => void reindexNlp()}
                  aria-label={t('editor.nlp.reindex')}
                >
                  {reindexing ? (
                    <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="h-3 w-3" aria-hidden />
                  )}
                  <span>{nlpLabel}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('editor.nlp.hint')}</TooltipContent>
            </Tooltip>
          ) : null}
          {coachIncomplete && templateCoverage ? (
            <span
              className="editor-status-meta editor-status-meta--coach"
              title={
                [
                  templateCoverage.missingHeadings.length
                    ? `${t('templateCoach.missing')}: ${templateCoverage.missingHeadings.join(', ')}`
                    : null,
                  templateCoverage.openChecklist.length
                    ? `${t('templateCoach.checklistOpen')}: ${templateCoverage.openChecklist
                        .slice(0, 3)
                        .join(', ')}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || t('templateCoach.hint')
              }
            >
              {t('templateCoach.chip', {
                present: templateCoverage.present,
                expected: templateCoverage.expected,
              })}
            </span>
          ) : null}
          {document && (
            <span className="editor-status-meta">{t('toolbar.stats.word', { count: words })}</span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="editor-status-icon-btn h-7 w-7"
                aria-label={t('fileMenu.print')}
                onClick={onPrint}
              >
                <Printer className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('fileMenu.print')}</TooltipContent>
          </Tooltip>
        </div>
      </footer>
    </TooltipProvider>
  )
}
