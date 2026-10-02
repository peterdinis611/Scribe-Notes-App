import { Sparkles, RefreshCw, Database, FileBarChart, Square } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import {
  nlpLibraryReport,
  nlpLlmComplete,
  nlpLlmStatus,
  nlpSetAnswerBackend,
  nlpSetEmbedBackend,
  nlpSetEnabled,
  nlpSetLlmPrefs,
  nlpStatus,
  nlpCancel,
  type NlpIndexProgress,
  type NlpLibraryReport,
  type NlpLlmStatus,
  type NlpStatus,
} from '@/lib/db/nlp-api'
import { LibraryReportView } from '@/components/settings/LibraryReportView'
import { LocalIntelligenceStatus } from '@/components/nlp/LocalIntelligenceStatus'
import { runNlpIndexAllWithProgress } from '@/lib/nlp/index-progress'
import { toast } from '@/lib/toast'

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] py-2.5 text-[13px] last:border-b-0">
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <span className="max-w-[62%] break-all text-right font-medium text-[var(--color-foreground)]">
        {value}
      </span>
    </div>
  )
}

export function NlpSection() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<NlpStatus | null>(null)
  const [llmLive, setLlmLive] = useState<NlpLlmStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [indexing, setIndexing] = useState(false)
  const [indexProgress, setIndexProgress] = useState<NlpIndexProgress | null>(null)
  const [reporting, setReporting] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [report, setReport] = useState<NlpLibraryReport | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await nlpStatus({ fresh: true })
      setStatus(next)
      if (next.enabled && next.llm?.enabled) {
        try {
          setLlmLive(await nlpLlmStatus())
        } catch {
          setLlmLive(null)
        }
      } else {
        setLlmLive(null)
      }
    } catch (error) {
      toast.error(t('settings.nlp.loadError'), String(error))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function runFullReindex() {
    setIndexing(true)
    setIndexProgress({ current: 0, total: 0, phase: 'starting' })
    try {
      const result = await runNlpIndexAllWithProgress(setIndexProgress)
      toast.success(t('settings.nlp.indexedToast', { count: result.indexed }))
      await refresh()
    } catch (error) {
      const message = String(error).toLowerCase()
      if (message.includes('cancel')) {
        toast.info(t('settings.nlp.indexCancelled'))
      } else {
        toast.error(t('settings.nlp.indexError'), String(error))
      }
    } finally {
      setIndexing(false)
      setIndexProgress(null)
    }
  }

  async function toggleEnabled() {
    if (!status) return
    try {
      const next = await nlpSetEnabled(!status.enabled)
      setStatus(next)
      toast.success(
        next.enabled ? t('settings.nlp.enabledToast') : t('settings.nlp.disabledToast'),
      )
      if (next.enabled && next.sidecarOk) {
        await runFullReindex()
      }
    } catch (error) {
      toast.error(t('settings.nlp.toggleError'), String(error))
    }
  }

  async function handleIndexAll() {
    await runFullReindex()
  }

  useEffect(() => {
    if (!report) return
    reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [report])

  async function handleReport() {
    setReporting(true)
    try {
      const result = await nlpLibraryReport()
      setReport(result)
      toast.success(t('settings.nlp.reportDone'))
    } catch (error) {
      toast.error(t('settings.nlp.reportError'), String(error))
    } finally {
      setReporting(false)
    }
  }

  async function handleExportReportPdf() {
    setExportingPdf(true)
    try {
      const { exportLibraryReportPdf, exportStructuredPdfAndReveal } = await import(
        '@/lib/export/structured-pdf'
      )
      const result = await exportLibraryReportPdf({
        title: t('structuredPdf.libraryReportTitle'),
        footerNote: t('structuredPdf.libraryReportFooter'),
      })
      const path = await exportStructuredPdfAndReveal(result)
      if (path) toast.success(t('toasts.exportDone'), path.split('/').pop() ?? path)
      else toast.info(t('structuredPdf.exportCancelled'))
    } catch (error) {
      toast.error(t('structuredPdf.exportError'), String(error))
    } finally {
      setExportingPdf(false)
    }
  }

  async function handleEmbedBackend(next: 'hash' | 'fast' | 'quality') {
    if (!status || status.embedBackend === next) return
    try {
      const updated = await nlpSetEmbedBackend(next)
      setStatus(updated)
      toast.success(
        next === 'quality'
          ? t('settings.nlp.qualityEnabledToast')
          : next === 'fast'
            ? t('settings.nlp.fastEnabledToast')
            : t('settings.nlp.hashEnabledToast'),
      )
    } catch (error) {
      toast.error(t('settings.nlp.embedBackendError'), String(error))
    }
  }

  async function handleAnswerBackend(next: 'auto' | 'index' | 'quality') {
    if (!status || (status.answerBackend ?? 'auto') === next) return
    try {
      const updated = await nlpSetAnswerBackend(next)
      setStatus(updated)
      toast.success(t('settings.nlp.answerBackendToast'))
    } catch (error) {
      toast.error(t('settings.nlp.answerBackendError'), String(error))
    }
  }

  async function handleLlmToggle() {
    if (!status) return
    const enabled = !(status.llm?.enabled ?? false)
    try {
      const updated = await nlpSetLlmPrefs({ enabled })
      setStatus(updated)
      if (enabled) {
        try {
          setLlmLive(await nlpLlmStatus())
        } catch (error) {
          setLlmLive(null)
          toast.error(t('settings.nlp.llmCheckError'), String(error))
        }
      } else {
        setLlmLive(null)
      }
      toast.success(enabled ? t('settings.nlp.llmEnabledToast') : t('settings.nlp.llmDisabledToast'))
    } catch (error) {
      toast.error(t('settings.nlp.llmSaveError'), String(error))
    }
  }

  async function handleLlmUse(kind: 'rewrite' | 'answer' | 'plan' | 'enhance') {
    if (!status?.llm) return
    try {
      const updated = await nlpSetLlmPrefs(
        kind === 'rewrite'
          ? { useRewrite: !status.llm.useRewrite }
          : kind === 'answer'
            ? { useAnswer: !status.llm.useAnswer }
            : kind === 'plan'
              ? { usePlan: !(status.llm.usePlan ?? true) }
              : { enhanceHeuristics: !(status.llm.enhanceHeuristics ?? false) },
      )
      setStatus(updated)
      toast.success(t('settings.nlp.llmSaveToast'))
    } catch (error) {
      toast.error(t('settings.nlp.llmSaveError'), String(error))
    }
  }

  async function handleLlmTest() {
    try {
      const result = await nlpLlmComplete({
        prompt: 'Reply with exactly: ok',
        system: 'You are a connectivity check. Reply with one short token only.',
        maxTokens: 16,
        temperature: 0,
      })
      toast.success(
        t('settings.nlp.llmTestOk', {
          model: result.model || status?.llm?.model || 'ollama',
          text: (result.text || '').trim().slice(0, 80),
        }),
      )
    } catch (error) {
      toast.error(t('settings.nlp.llmTestError'), String(error))
    }
  }

  async function handleLlmBaseUrl(value: string) {
    try {
      const updated = await nlpSetLlmPrefs({ baseUrl: value })
      setStatus(updated)
      toast.success(t('settings.nlp.llmSaveToast'))
    } catch (error) {
      toast.error(t('settings.nlp.llmSaveError'), String(error))
    }
  }

  async function handleLlmModel(value: string) {
    try {
      const updated = await nlpSetLlmPrefs({ model: value })
      setStatus(updated)
      toast.success(t('settings.nlp.llmSaveToast'))
    } catch (error) {
      toast.error(t('settings.nlp.llmSaveError'), String(error))
    }
  }

  async function handleLlmCheck() {
    try {
      const live = await nlpLlmStatus()
      setLlmLive(live)
      if (live.reachable) {
        toast.success(t('settings.nlp.llmReachableToast', { count: live.models.length }))
        if (!status?.llm?.model && live.model) {
          const updated = await nlpSetLlmPrefs({ model: live.model })
          setStatus(updated)
        }
      } else {
        toast.error(t('settings.nlp.llmUnreachableToast'), live.error ?? undefined)
      }
    } catch (error) {
      setLlmLive(null)
      toast.error(t('settings.nlp.llmCheckError'), String(error))
    }
  }

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title={t('settings.nlp.title')}
        description={t('settings.nlp.description')}
      />

      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
        {t('settings.nlp.intro')}
      </p>

      <LocalIntelligenceStatus className="mb-4" showStartFilesCta />

      {status?.enabled && !status.sidecarOk && (
        <div className="mb-4 rounded-xl border border-[color-mix(in_srgb,var(--color-destructive)_35%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-destructive)_8%,var(--color-surface))] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--color-foreground)]">
          <p className="m-0 font-medium">{t('settings.nlp.sidecarUnavailableTitle')}</p>
          <p className="mt-1 mb-0 text-[var(--color-muted-foreground)]">
            {status.error ?? t('settings.nlp.sidecarUnavailableHint')}
          </p>
          <p className="mt-1 mb-0 break-all text-[11px] text-[var(--color-muted-foreground)]">
            {status.scriptPath}
          </p>
        </div>
      )}

      {!status?.sidecarAvailable && (
        <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
          {t('settings.nlp.sidecarScriptMissing')}
        </div>
      )}

      {status?.enabled && status.sidecarOk && status.indexStale && (
        <div className="mb-4 rounded-xl border border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_8%,var(--color-surface))] px-3 py-3 text-[12px] leading-relaxed text-[var(--color-foreground)]">
          <p className="m-0 font-medium">{t('settings.nlp.staleIndexTitle')}</p>
          <p className="mt-1 mb-3 text-[var(--color-muted-foreground)]">
            {t('settings.nlp.staleIndexDescription', {
              stored: status.storedModel ?? '—',
              current: status.model ?? '—',
              count: status.staleIndexCount,
            })}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={indexing || loading}
            onClick={() => void handleIndexAll()}
          >
            <Database className="mr-1.5 h-3.5 w-3.5" />
            {indexing ? t('settings.nlp.indexing') : t('settings.nlp.reindexNow')}
          </Button>
        </div>
      )}

      {indexing && indexProgress && indexProgress.total > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-[12px]">
            <span className="font-medium text-[var(--color-foreground)]">
              {t('settings.nlp.indexProgressLabel')}
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums text-[var(--color-muted-foreground)]">
                {t('settings.nlp.indexProgressCount', {
                  current: indexProgress.current,
                  total: indexProgress.total,
                })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => void nlpCancel()}
              >
                <Square className="mr-1 h-3 w-3" />
                {t('settings.nlp.cancelIndex')}
              </Button>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-200"
              style={{
                width: `${Math.min(100, Math.round((indexProgress.current / indexProgress.total) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}

      <SettingsGroup className="mb-4">
        <SettingsRow
          title={t('settings.nlp.enableTitle')}
          description={t('settings.nlp.enableDescription')}
        >
          <Button
            type="button"
            variant={status?.enabled ? 'default' : 'outline'}
            size="sm"
            disabled={loading || indexing}
            onClick={() => void toggleEnabled()}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            {status?.enabled ? t('settings.nlp.enabled') : t('settings.nlp.enable')}
          </Button>
        </SettingsRow>

        <SettingsRow
          title={t('settings.nlp.indexTitle')}
          description={t('settings.nlp.indexDescription')}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!status?.enabled || indexing || loading}
            onClick={() => void handleIndexAll()}
          >
            <Database className="mr-1.5 h-3.5 w-3.5" />
            {indexing ? t('settings.nlp.indexing') : t('settings.nlp.reindex')}
          </Button>
        </SettingsRow>

        <SettingsRow
          title={t('settings.nlp.embedBackendTitle')}
          description={
            status?.qualityAvailable || status?.fastAvailable || status?.extras?.model2vec
              ? t('settings.nlp.embedBackendDescription')
              : t('settings.nlp.embedBackendInstallHint')
          }
        >
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button
              type="button"
              variant={status?.embedBackend === 'hash' ? 'default' : 'outline'}
              size="sm"
              disabled={!status?.enabled || loading || indexing}
              onClick={() => void handleEmbedBackend('hash')}
            >
              {t('settings.nlp.embedBackendHash')}
            </Button>
            <Button
              type="button"
              variant={status?.embedBackend === 'fast' ? 'default' : 'outline'}
              size="sm"
              disabled={
                !status?.enabled ||
                !(status?.fastAvailable ?? status?.extras?.model2vec) ||
                loading ||
                indexing
              }
              onClick={() => void handleEmbedBackend('fast')}
            >
              {t('settings.nlp.embedBackendFast')}
            </Button>
            <Button
              type="button"
              variant={status?.embedBackend === 'quality' ? 'default' : 'outline'}
              size="sm"
              disabled={!status?.enabled || !status?.qualityAvailable || loading || indexing}
              onClick={() => void handleEmbedBackend('quality')}
            >
              {t('settings.nlp.embedBackendQuality')}
            </Button>
          </div>
        </SettingsRow>

        <SettingsRow
          title={t('settings.nlp.answerBackendTitle')}
          description={t('settings.nlp.answerBackendDescription')}
        >
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button
              type="button"
              variant={(status?.answerBackend ?? 'auto') === 'auto' ? 'default' : 'outline'}
              size="sm"
              disabled={!status?.enabled || loading || indexing}
              onClick={() => void handleAnswerBackend('auto')}
            >
              {t('settings.nlp.answerBackendAuto')}
            </Button>
            <Button
              type="button"
              variant={(status?.answerBackend ?? 'auto') === 'index' ? 'default' : 'outline'}
              size="sm"
              disabled={!status?.enabled || loading || indexing}
              onClick={() => void handleAnswerBackend('index')}
            >
              {t('settings.nlp.answerBackendIndex')}
            </Button>
            <Button
              type="button"
              variant={(status?.answerBackend ?? 'auto') === 'quality' ? 'default' : 'outline'}
              size="sm"
              disabled={!status?.enabled || !status?.qualityAvailable || loading || indexing}
              onClick={() => void handleAnswerBackend('quality')}
            >
              {t('settings.nlp.answerBackendQuality')}
            </Button>
          </div>
        </SettingsRow>

        <SettingsRow
          title={t('settings.nlp.llmTitle')}
          description={t('settings.nlp.llmDescription')}
        >
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button
              type="button"
              variant={status?.llm?.enabled ? 'default' : 'outline'}
              size="sm"
              disabled={!status?.enabled || loading || indexing}
              onClick={() => void handleLlmToggle()}
            >
              {status?.llm?.enabled ? t('settings.nlp.llmOn') : t('settings.nlp.llmOff')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!status?.enabled || !status?.llm?.enabled || loading}
              onClick={() => void handleLlmCheck()}
            >
              {t('settings.nlp.llmCheck')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!status?.enabled || !status?.llm?.enabled || loading}
              onClick={() => void handleLlmTest()}
            >
              {t('settings.nlp.llmTest')}
            </Button>
          </div>
        </SettingsRow>

        {status?.llm?.enabled ? (
          <>
            <SettingsRow
              title={t('settings.nlp.llmBaseUrlTitle')}
              description={t('settings.nlp.llmBaseUrlDescription')}
            >
              <input
                type="url"
                className="w-full max-w-[280px] rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-[12px] text-[var(--color-foreground)] outline-none focus:border-[var(--color-accent)]"
                defaultValue={status.llm.baseUrl}
                key={status.llm.baseUrl}
                disabled={!status.enabled || loading}
                onBlur={(event) => {
                  const next = event.target.value.trim()
                  if (!next || next === status.llm?.baseUrl) return
                  void handleLlmBaseUrl(next)
                }}
                placeholder="http://127.0.0.1:11434"
              />
            </SettingsRow>

            <SettingsRow
              title={t('settings.nlp.llmModelTitle')}
              description={t('settings.nlp.llmModelDescription')}
            >
              <select
                className="max-w-[280px] rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-[12px] text-[var(--color-foreground)] outline-none focus:border-[var(--color-accent)]"
                value={status.llm.model || llmLive?.model || ''}
                disabled={!status.enabled || loading}
                onChange={(event) => void handleLlmModel(event.target.value)}
              >
                <option value="">{t('settings.nlp.llmModelAuto')}</option>
                {(llmLive?.models?.length
                  ? llmLive.models
                  : status.llm.model
                    ? [status.llm.model]
                    : []
                ).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </SettingsRow>

            <SettingsRow
              title={t('settings.nlp.llmUsesTitle')}
              description={t('settings.nlp.llmUsesDescription')}
            >
              <div className="flex flex-wrap justify-end gap-1.5">
                <Button
                  type="button"
                  variant={status.llm.useRewrite ? 'default' : 'outline'}
                  size="sm"
                  disabled={!status.enabled || loading}
                  onClick={() => void handleLlmUse('rewrite')}
                >
                  {t('settings.nlp.llmUseRewrite')}
                </Button>
                <Button
                  type="button"
                  variant={status.llm.useAnswer ? 'default' : 'outline'}
                  size="sm"
                  disabled={!status.enabled || loading}
                  onClick={() => void handleLlmUse('answer')}
                >
                  {t('settings.nlp.llmUseAnswer')}
                </Button>
                <Button
                  type="button"
                  variant={(status.llm.usePlan ?? true) ? 'default' : 'outline'}
                  size="sm"
                  disabled={!status.enabled || loading}
                  onClick={() => void handleLlmUse('plan')}
                >
                  {t('settings.nlp.llmUsePlan')}
                </Button>
                <Button
                  type="button"
                  variant={(status.llm.enhanceHeuristics ?? false) ? 'default' : 'outline'}
                  size="sm"
                  disabled={!status.enabled || loading}
                  onClick={() => void handleLlmUse('enhance')}
                >
                  {t('settings.nlp.llmEnhanceHeuristics')}
                </Button>
              </div>
            </SettingsRow>

            <SettingsRow
              title={t('settings.nlp.llmStatusTitle')}
              description={
                llmLive && !llmLive.reachable
                  ? t('settings.nlp.llmStatusDown')
                  : llmLive?.reachable && status.llm.model && !llmLive.models.includes(status.llm.model)
                    ? t('settings.nlp.llmModelMissing', { model: status.llm.model })
                    : t('settings.nlp.llmInstallHint')
              }
            >
              <span className="text-right text-[12px] text-[var(--color-muted-foreground)]">
                {llmLive
                  ? llmLive.reachable
                    ? t('settings.nlp.llmStatusOk', { count: llmLive.models.length })
                    : t('settings.nlp.llmStatusDown')
                  : t('settings.nlp.llmStatusUnknown')}
              </span>
            </SettingsRow>
          </>
        ) : null}

        <SettingsRow
          title={t('settings.nlp.extrasTitle')}
          description={t('settings.nlp.extrasDescription')}
        >
          <div className="flex max-w-md flex-wrap justify-end gap-1.5">
            {(
              [
                ['rapidfuzz', status?.extras?.rapidfuzz],
                ['lingua', status?.extras?.lingua],
                ['ftfy', status?.extras?.ftfy],
                ['dateparser', status?.extras?.dateparser],
                ['argosTranslate', status?.argosAvailable ?? status?.extras?.argosTranslate],
                ['spacy', status?.spacyAvailable ?? status?.extras?.spacy],
                ['onnxruntime', status?.onnxAvailable ?? status?.extras?.onnxruntime],
                ['faiss', status?.faissAvailable ?? status?.extras?.faiss],
                ['model2vec', status?.fastAvailable ?? status?.extras?.model2vec],
                ['bm25s', status?.bm25Available ?? status?.extras?.bm25s],
                ['pynear', status?.hnswAvailable ?? status?.extras?.pynear],
                ['sentenceTransformers', status?.qualityAvailable ?? status?.extras?.sentenceTransformers],
              ] as const
            ).map(([key, on]) => (
              <span
                key={key}
                className={
                  on
                    ? 'rounded-full border border-[var(--color-accent)]/40 bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)]'
                    : 'rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-muted-foreground)]'
                }
              >
                {key}
              </span>
            ))}
          </div>
        </SettingsRow>

        <SettingsRow
          title={t('settings.nlp.rustExtrasTitle')}
          description={t('settings.nlp.rustExtrasDescription')}
        >
          <div className="flex max-w-md flex-wrap justify-end gap-1.5">
            {(
              [
                ['rapidfuzz', status?.rustExtras?.fuzzy],
                ['rayon', status?.rustExtras?.searchFast],
                ['simsimd', status?.rustExtras?.vectors],
                ['encoding', status?.rustExtras?.unicode],
              ] as const
            ).map(([key, on]) => (
              <span
                key={`rust-${key}`}
                className={
                  on
                    ? 'rounded-full border border-[var(--color-accent)]/40 bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)]'
                    : 'rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-muted-foreground)]'
                }
              >
                {key}
              </span>
            ))}
          </div>
        </SettingsRow>

        <SettingsRow
          title={t('settings.nlp.reportTitle')}
          description={t('settings.nlp.reportDescription')}
        >
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!status?.enabled || reporting || loading}
              onClick={() => void handleReport()}
            >
              <FileBarChart className="mr-1.5 h-3.5 w-3.5" />
              {reporting ? t('settings.nlp.reporting') : t('settings.nlp.runReport')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!status?.enabled || exportingPdf || loading}
              onClick={() => void handleExportReportPdf()}
            >
              <FileBarChart className="mr-1.5 h-3.5 w-3.5" />
              {exportingPdf ? t('settings.nlp.exportingReportPdf') : t('settings.nlp.exportReportPdf')}
            </Button>
          </div>
        </SettingsRow>

        <SettingsRow title={t('settings.nlp.refreshTitle')} description={t('settings.nlp.refreshDescription')}>
          <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            {t('common.refresh')}
          </Button>
        </SettingsRow>
      </SettingsGroup>

      {status && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <StatRow label={t('settings.nlp.statusEnabled')} value={status.enabled ? t('settings.nlp.yes') : t('settings.nlp.no')} />
          <StatRow label={t('settings.nlp.statusSidecar')} value={status.sidecarOk ? t('settings.nlp.yes') : t('settings.nlp.no')} />
          <StatRow label={t('settings.nlp.statusScript')} value={status.scriptPath} />
          <StatRow label={t('settings.nlp.statusModel')} value={status.model ?? '—'} />
          <StatRow
            label={t('settings.nlp.statusEmbedBackend')}
            value={
              status.embedBackend === 'quality'
                ? t('settings.nlp.embedBackendQuality')
                : status.embedBackend === 'fast'
                  ? t('settings.nlp.embedBackendFast')
                  : t('settings.nlp.embedBackendHash')
            }
          />
          <StatRow label={t('settings.nlp.statusStoredModel')} value={status.storedModel ?? '—'} />
          <StatRow label={t('settings.nlp.statusIndexed')} value={status.indexedCount} />
          {status.indexStale && (
            <StatRow
              label={t('settings.nlp.statusStaleCount')}
              value={status.staleIndexCount}
            />
          )}
          <StatRow label={t('settings.nlp.statusPython')} value={status.pythonBin} />
          {status.error && <StatRow label={t('settings.nlp.statusError')} value={status.error} />}
        </div>
      )}

      {report && (
        <div ref={reportRef} className="mt-4">
          <LibraryReportView report={report} />
        </div>
      )}
    </SettingsSection>
  )
}
