import { Sparkles, RefreshCw, Database, FileBarChart } from 'lucide-react'
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
  nlpSetEmbedBackend,
  nlpSetEnabled,
  nlpStatus,
  type NlpIndexProgress,
  type NlpLibraryReport,
  type NlpStatus,
} from '@/lib/db/nlp-api'
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
  const [loading, setLoading] = useState(true)
  const [indexing, setIndexing] = useState(false)
  const [indexProgress, setIndexProgress] = useState<NlpIndexProgress | null>(null)
  const [reporting, setReporting] = useState(false)
  const [report, setReport] = useState<NlpLibraryReport | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setStatus(await nlpStatus())
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
      toast.error(t('settings.nlp.indexError'), String(error))
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

  async function handleEmbedBackend(next: 'hash' | 'quality') {
    if (!status || status.embedBackend === next) return
    try {
      const updated = await nlpSetEmbedBackend(next)
      setStatus(updated)
      toast.success(
        next === 'quality'
          ? t('settings.nlp.qualityEnabledToast')
          : t('settings.nlp.hashEnabledToast'),
      )
    } catch (error) {
      toast.error(t('settings.nlp.embedBackendError'), String(error))
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
            <span className="tabular-nums text-[var(--color-muted-foreground)]">
              {t('settings.nlp.indexProgressCount', {
                current: indexProgress.current,
                total: indexProgress.total,
              })}
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
            status?.qualityAvailable
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
          title={t('settings.nlp.reportTitle')}
          description={t('settings.nlp.reportDescription')}
        >
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
        <div
          ref={reportRef}
          className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <h3 className="mb-2 text-[13px] font-semibold">{t('settings.nlp.reportHeading')}</h3>
          <pre className="m-0 max-h-[420px] overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--color-foreground)]">
            {report.markdown}
          </pre>
        </div>
      )}
    </SettingsSection>
  )
}
