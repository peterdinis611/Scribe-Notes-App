import { Sparkles, RefreshCw, Database, FileBarChart } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import {
  nlpIndexAll,
  nlpLibraryReport,
  nlpSetEnabled,
  nlpStatus,
  type NlpLibraryReport,
  type NlpStatus,
} from '@/lib/db/nlp-api'
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
  const [reporting, setReporting] = useState(false)
  const [report, setReport] = useState<NlpLibraryReport | null>(null)

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

  async function toggleEnabled() {
    if (!status) return
    try {
      const next = await nlpSetEnabled(!status.enabled)
      setStatus(next)
      toast.success(
        next.enabled ? t('settings.nlp.enabledToast') : t('settings.nlp.disabledToast'),
      )
      if (next.enabled && next.sidecarOk) {
        setIndexing(true)
        try {
          const result = await nlpIndexAll()
          toast.success(t('settings.nlp.indexedToast', { count: result.indexed }))
          await refresh()
        } finally {
          setIndexing(false)
        }
      }
    } catch (error) {
      toast.error(t('settings.nlp.toggleError'), String(error))
    }
  }

  async function handleIndexAll() {
    setIndexing(true)
    try {
      const result = await nlpIndexAll()
      toast.success(t('settings.nlp.indexedToast', { count: result.indexed }))
      await refresh()
    } catch (error) {
      toast.error(t('settings.nlp.indexError'), String(error))
    } finally {
      setIndexing(false)
    }
  }

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

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title={t('settings.nlp.title')}
        description={t('settings.nlp.description')}
      />

      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
        {t('settings.nlp.intro')}
      </p>

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
          <StatRow label={t('settings.nlp.statusEnabled')} value={status.enabled ? t('common.yes') : t('common.no')} />
          <StatRow label={t('settings.nlp.statusSidecar')} value={status.sidecarOk ? t('common.yes') : t('common.no')} />
          <StatRow label={t('settings.nlp.statusModel')} value={status.model ?? '—'} />
          <StatRow label={t('settings.nlp.statusIndexed')} value={status.indexedCount} />
          <StatRow label={t('settings.nlp.statusPython')} value={status.pythonBin} />
          {status.error && <StatRow label={t('settings.nlp.statusError')} value={status.error} />}
        </div>
      )}

      {report && (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-2 text-[13px] font-semibold">{t('settings.nlp.reportHeading')}</h3>
          <pre className="m-0 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--color-foreground)]">
            {report.markdown}
          </pre>
        </div>
      )}
    </SettingsSection>
  )
}
