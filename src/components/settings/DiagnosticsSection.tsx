import { Activity, Copy, Eraser, RefreshCw, Terminal } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import {
  flushPendingWrites,
  getBackendStats,
  type BackendStats,
} from '@/lib/db/api'
import { isFrontendDebug, setFrontendDebug } from '@/lib/debug'
import {
  loggingClear,
  loggingPing,
  loggingRecent,
  loggingSetLevel,
  loggingStatus,
  type LogLine,
  type LoggingStatus,
} from '@/lib/logging'
import type { LoggingLevel } from '@/lib/logging/settings'
import { isTauriRuntime } from '@/lib/tauri'
import { toast } from '@/lib/toast'
import { useAppDispatch } from '@/store/hooks'
import { applyDiskPersistResult, runFolderReconcile } from '@/lib/disk-sync'

const RELEASES_URL = 'https://github.com/peterdinis611/Scribe-Notes-App/releases'
const LEVELS: LoggingLevel[] = ['error', 'warn', 'info', 'debug', 'trace']

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

function formatLogTime(tsMs: number): string {
  const d = new Date(tsMs)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds(),
  ).padStart(2, '0')}`
}

export function DiagnosticsSection() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const [stats, setStats] = useState<BackendStats | null>(null)
  const [logging, setLogging] = useState<LoggingStatus | null>(null)
  const [lines, setLines] = useState<LogLine[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [pinging, setPinging] = useState(false)
  const [feVerbose, setFeVerbose] = useState(() => isFrontendDebug())

  const refreshLogs = useCallback(async () => {
    if (!isTauriRuntime()) return
    try {
      const [status, recent] = await Promise.all([
        loggingStatus(),
        loggingRecent({ limit: 80 }),
      ])
      setLogging(status)
      setLines(recent)
    } catch {
      setLogging(null)
      setLines([])
    }
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      setStats(await getBackendStats())
      await refreshLogs()
    } catch (error) {
      toast.error(t('diagnostics.loadError'), String(error))
    } finally {
      setLoading(false)
    }
  }

  async function handleLoggingPing() {
    if (!isTauriRuntime()) {
      toast.error(t('diagnostics.terminalUnavailable'))
      return
    }
    setPinging(true)
    try {
      const status = await loggingPing()
      setLogging(status)
      setLines(await loggingRecent({ limit: 80 }))
      toast.success(t('diagnostics.terminalPingOk'), t('diagnostics.terminalPingHint'))
    } catch (error) {
      toast.error(t('diagnostics.terminalPingError'), String(error))
    } finally {
      setPinging(false)
    }
  }

  async function handleClearLogs() {
    if (!isTauriRuntime()) return
    try {
      const nextStats = await loggingClear()
      setLogging((prev) => (prev ? { ...prev, stats: nextStats } : prev))
      setLines([])
      toast.success(t('diagnostics.logsCleared'))
    } catch (error) {
      toast.error(t('diagnostics.logsClearError'), String(error))
    }
  }

  async function handleSetLevel(level: string) {
    if (!isTauriRuntime()) return
    try {
      const status = await loggingSetLevel(level)
      setLogging(status)
      toast.success(t('diagnostics.levelChanged'), level)
    } catch (error) {
      toast.error(t('diagnostics.levelChangeError'), String(error))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function handleFlush() {
    try {
      const result = await flushPendingWrites()
      applyDiskPersistResult(dispatch, result)
      if (result.flushed === 0) {
        toast.success(t('diagnostics.flushEmpty'))
      } else {
        toast.success(t('diagnostics.flushDone'), t('diagnostics.flushCount', { count: result.flushed }))
      }
      await refresh()
    } catch (error) {
      toast.error(t('diagnostics.flushError'), String(error))
    }
  }

  async function handleReconcile() {
    setSyncing(true)
    try {
      const result = await runFolderReconcile(dispatch, { force: true, announceSuccess: true })
      if (result) await refresh()
    } catch (error) {
      toast.error(t('toasts.reconcileError'), String(error))
    } finally {
      setSyncing(false)
    }
  }

  async function copyDiagnostics() {
    if (!stats) {
      toast.error(t('diagnostics.copyEmpty'))
      return
    }
    try {
      const payload = JSON.stringify({ stats, logging, lines: lines.slice(-40) }, null, 2)
      await navigator.clipboard.writeText(payload)
      toast.success(t('diagnostics.copied'))
    } catch (error) {
      toast.error(t('diagnostics.copyError'), String(error))
    }
  }

  function toggleFeVerbose() {
    const next = !feVerbose
    setFrontendDebug(next)
    setFeVerbose(next)
    toast.success(
      next ? t('diagnostics.feDebugOn') : t('diagnostics.feDebugOff'),
      t('diagnostics.feDebugHint'),
    )
    void refreshLogs()
  }

  async function handleCheckUpdates() {
    setCheckingUpdates(true)
    try {
      const version = stats?.appVersion ?? (await getVersion().catch(() => '—'))
      await openUrl(RELEASES_URL)
      toast.success(
        t('diagnostics.updatesOpened'),
        t('diagnostics.updatesOpenedHint', { version }),
      )
    } catch (error) {
      toast.error(t('diagnostics.updatesError'), String(error))
    } finally {
      setCheckingUpdates(false)
    }
  }

  const runtimeLevel = (logging?.runtimeLevel ?? logging?.level ?? 'info') as LoggingLevel

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
          {logging ? (
            <>
              <StatRow
                label={t('diagnostics.terminalLogger')}
                value={
                  logging.ready
                    ? t('diagnostics.terminalReady', { level: logging.runtimeLevel })
                    : t('diagnostics.terminalOff')
                }
              />
              <StatRow
                label={t('diagnostics.logRing')}
                value={`${logging.stats.retained}/${logging.stats.capacity} · e${logging.stats.error} w${logging.stats.warn} i${logging.stats.info}`}
              />
              {logging.filePath ? (
                <StatRow label={t('diagnostics.logFile')} value={logging.filePath} />
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {isTauriRuntime() ? (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium text-[var(--color-muted-foreground)]">
              {t('diagnostics.runtimeLevel')}
            </span>
            <Select value={runtimeLevel} onValueChange={(v) => void handleSetLevel(v)}>
              <SelectTrigger className="h-8 w-[120px]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void refreshLogs()}>
              <RefreshCw className="h-3.5 w-3.5" />
              {t('diagnostics.refreshLogs')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleClearLogs()}>
              <Eraser className="h-3.5 w-3.5" />
              {t('diagnostics.clearLogs')}
            </Button>
          </div>
          <div
            className="max-h-56 overflow-auto rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-canvas)_88%,var(--color-foreground))] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--color-foreground)]"
            role="log"
            aria-label={t('diagnostics.recentLogs')}
          >
            {lines.length === 0 ? (
              <p className="text-[var(--color-muted-foreground)]">{t('diagnostics.logsEmpty')}</p>
            ) : (
              lines.map((line) => (
                <div key={line.seq} className="whitespace-pre-wrap break-all">
                  <span className="text-[var(--color-muted-foreground)]">
                    {formatLogTime(line.tsMs)}
                  </span>{' '}
                  <span className="uppercase">{line.level.padEnd(5, ' ')}</span>{' '}
                  <span className="text-[var(--color-muted-foreground)]">[{line.target}]</span>{' '}
                  {line.message}
                </div>
              ))
            )}
          </div>
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
        <Button
          variant="outline"
          size="sm"
          disabled={checkingUpdates}
          onClick={() => void handleCheckUpdates()}
        >
          {checkingUpdates ? t('diagnostics.updatesChecking') : t('diagnostics.checkUpdates')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pinging || !isTauriRuntime()}
          onClick={() => void handleLoggingPing()}
          title={t('diagnostics.terminalPingHint')}
        >
          <Terminal className="h-3.5 w-3.5" />
          {pinging ? t('diagnostics.terminalPinging') : t('diagnostics.terminalPing')}
        </Button>
        <Button
          variant={feVerbose ? 'default' : 'outline'}
          size="sm"
          onClick={toggleFeVerbose}
          title={t('diagnostics.feDebugHint')}
        >
          <Terminal className="h-3.5 w-3.5" />
          {feVerbose ? t('diagnostics.feDebugDisable') : t('diagnostics.feDebugEnable')}
        </Button>
      </div>
    </SettingsSection>
  )
}
