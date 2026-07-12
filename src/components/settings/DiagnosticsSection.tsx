import { Activity, Copy, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Button } from '@/components/ui/button'
import {
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import {
  flushPendingWrites,
  getBackendStats,
  reconcileStorage,
  type BackendStats,
} from '@/lib/db/api'
import { toast } from '@/lib/toast'
import { useAppDispatch } from '@/store/hooks'
import { applyDiskPersistResult } from '@/lib/disk-sync'

const RELEASES_URL = 'https://github.com/scribe-app/scribe/releases/latest'

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

export function DiagnosticsSection() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const [stats, setStats] = useState<BackendStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      setStats(await getBackendStats())
    } catch (error) {
      toast.error(t('diagnostics.loadError'), String(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function handleFlush() {
    try {
      const result = await flushPendingWrites()
      applyDiskPersistResult(dispatch, result)
      toast.success(t('diagnostics.flushDone'))
      await refresh()
    } catch (error) {
      toast.error(t('diagnostics.flushError'), String(error))
    }
  }

  async function handleReconcile() {
    setSyncing(true)
    try {
      await reconcileStorage()
      toast.success(t('toasts.reconcileSuccess'))
      await refresh()
    } catch (error) {
      toast.error(t('toasts.reconcileError'), String(error))
    } finally {
      setSyncing(false)
    }
  }

  async function copyDiagnostics() {
    if (!stats) return
    const payload = JSON.stringify(stats, null, 2)
    await navigator.clipboard.writeText(payload)
    toast.success(t('diagnostics.copied'))
  }

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title={t('settings.diagnostics.title')}
        description={t('settings.diagnostics.description')}
        actions={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t('diagnostics.refresh')}
          </Button>
        }
      />

      {loading && !stats ? (
        <p className="text-[13px] text-[var(--color-muted-foreground)]">{t('diagnostics.loading')}</p>
      ) : stats ? (
        <div className="rounded-xl border border-[var(--color-border)] px-4">
          <StatRow label={t('diagnostics.appVersion')} value={stats.appVersion} />
          <StatRow label={t('diagnostics.schemaVersion')} value={stats.schemaVersion} />
          <StatRow label={t('diagnostics.documents')} value={stats.documentsCount} />
          <StatRow label={t('diagnostics.folders')} value={stats.foldersCount} />
          <StatRow label={t('diagnostics.revisions')} value={stats.revisionsCount} />
          <StatRow label={t('diagnostics.links')} value={stats.linksCount} />
          <StatRow label={t('diagnostics.wal')} value={stats.walEnabled ? 'WAL' : '—'} />
          <StatRow label={t('diagnostics.pendingDisk')} value={stats.pendingDiskJobs} />
          <StatRow label={t('diagnostics.dbPath')} value={stats.dbPath} />
          <StatRow label={t('diagnostics.documentsDir')} value={stats.documentsDir} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void handleFlush()}>
          <Activity className="h-3.5 w-3.5" />
          {t('diagnostics.flushPending')}
        </Button>
        <Button variant="outline" size="sm" disabled={syncing} onClick={() => void handleReconcile()}>
          <RefreshCw className="h-3.5 w-3.5" />
          {syncing ? t('settings.storage.reconciling') : t('diagnostics.reconcile')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void copyDiagnostics()}>
          <Copy className="h-3.5 w-3.5" />
          {t('diagnostics.copy')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void openUrl(RELEASES_URL)}>
          {t('diagnostics.checkUpdates')}
        </Button>
      </div>
    </SettingsSection>
  )
}
