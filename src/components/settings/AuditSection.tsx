import { Download, Lock, RefreshCw, Unlock } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import {
  auditAdminLock,
  auditAdminSetup,
  auditAdminStatus,
  auditAdminUnlock,
  exportAuditEventsJsonl,
  getAuditStats,
  listAuditEvents,
  setAuditEventsKeep,
  type AuditAdminStatus,
  type AuditEvent,
  type AuditStats,
} from '@/lib/db/api'
import { toast } from '@/lib/toast'
import { formatRelativeTime } from '@/lib/utils'

function auditEpochSeconds(value: number): number {
  return value > 1_000_000_000_000 ? Math.floor(value / 1000) : value
}

export function AuditSection() {
  const { t } = useTranslation()
  const [admin, setAdmin] = useState<AuditAdminStatus | null>(null)
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [password, setPassword] = useState('')
  const [keepDraft, setKeepDraft] = useState('5000')
  const [busy, setBusy] = useState(false)

  const refreshAdmin = useCallback(async () => {
    try {
      const status = await auditAdminStatus()
      setAdmin(status)
      setKeepDraft(String(status.keepLimit || 5000))
      return status
    } catch (error) {
      toast.error(t('settings.audit.loadError'), String(error))
      return null
    }
  }, [t])

  const refreshEvents = useCallback(async () => {
    setLoading(true)
    try {
      const [nextStats, nextEvents] = await Promise.all([
        getAuditStats(),
        listAuditEvents({ limit: 40, q: q.trim() || null }),
      ])
      setStats(nextStats)
      setEvents(nextEvents)
    } catch (error) {
      toast.error(t('settings.audit.loadError'), String(error))
    } finally {
      setLoading(false)
    }
  }, [q, t])

  useEffect(() => {
    void refreshAdmin()
  }, [refreshAdmin])

  useEffect(() => {
    if (admin?.unlocked) void refreshEvents()
  }, [admin?.unlocked, refreshEvents])

  async function handleSetupOrUnlock() {
    const value = password.trim()
    if (value.length < 8) {
      toast.error(t('settings.audit.passwordTooShort'))
      return
    }
    setBusy(true)
    try {
      const next = admin?.configured
        ? await auditAdminUnlock(value)
        : await auditAdminSetup(value)
      setAdmin(next)
      setPassword('')
      toast.success(
        admin?.configured ? t('settings.audit.unlocked') : t('settings.audit.setupDone'),
      )
      await refreshEvents()
    } catch (error) {
      toast.error(t('settings.audit.unlockError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleLock() {
    setBusy(true)
    try {
      setAdmin(await auditAdminLock())
      setEvents([])
      setStats(null)
      toast.success(t('settings.audit.locked'))
    } catch (error) {
      toast.error(t('settings.audit.lockError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleKeep() {
    const keep = Number(keepDraft)
    if (!Number.isFinite(keep) || keep < 100) {
      toast.error(t('settings.audit.keepInvalid'))
      return
    }
    setBusy(true)
    try {
      const next = await setAuditEventsKeep(Math.floor(keep))
      setAdmin(next)
      toast.success(t('settings.audit.keepSaved'))
      await refreshEvents()
    } catch (error) {
      toast.error(t('settings.audit.keepError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleExport() {
    try {
      const jsonl = await exportAuditEventsJsonl({ limit: 2000, q: q.trim() || null })
      await navigator.clipboard.writeText(jsonl)
      toast.success(t('settings.audit.exportCopied'))
    } catch (error) {
      toast.error(t('settings.audit.exportError'), String(error))
    }
  }

  const unlocked = Boolean(admin?.unlocked)

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title={t('settings.audit.title')}
        description={t('settings.audit.description')}
      />

      {!unlocked ? (
        <div className="mb-4 space-y-3 rounded-md border border-[var(--color-border)] px-3 py-3">
          <p className="m-0 text-[13px] text-[var(--color-muted-foreground)]">
            {admin?.configured
              ? t('settings.audit.unlockHint')
              : t('settings.audit.setupHint')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('settings.audit.passwordPlaceholder')}
              className="max-w-xs"
              autoComplete="new-password"
            />
            <Button type="button" size="sm" disabled={busy} onClick={() => void handleSetupOrUnlock()}>
              {admin?.configured ? (
                <>
                  <Unlock className="size-3.5" />
                  {t('settings.audit.unlock')}
                </>
              ) : (
                t('settings.audit.setup')
              )}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              className="min-w-[12rem] flex-1 rounded-md border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-[13px]"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={t('settings.audit.searchPlaceholder')}
              aria-label={t('settings.audit.searchPlaceholder')}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshEvents()}
              disabled={loading}
            >
              <RefreshCw className="size-3.5" />
              {t('common.refresh')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleExport()}>
              <Download className="size-3.5" />
              {t('settings.audit.export')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void handleLock()}>
              <Lock className="size-3.5" />
              {t('settings.audit.lock')}
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-2">
            <label className="text-[12px] text-[var(--color-muted-foreground)]">
              {t('settings.audit.keepLimit')}
              <Input
                type="number"
                min={100}
                value={keepDraft}
                onChange={(event) => setKeepDraft(event.target.value)}
                className="mt-1 w-28"
              />
            </label>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void handleKeep()}>
              {t('settings.audit.saveKeep')}
            </Button>
          </div>

          {stats && (
            <div className="mb-4 grid gap-2 text-[13px] sm:grid-cols-3">
              <div className="rounded-md border border-[var(--color-border)] px-3 py-2">
                <p className="text-[var(--color-muted-foreground)]">{t('settings.audit.total')}</p>
                <p className="font-medium">{stats.total}</p>
              </div>
              <div className="rounded-md border border-[var(--color-border)] px-3 py-2">
                <p className="text-[var(--color-muted-foreground)]">{t('settings.audit.keepLimit')}</p>
                <p className="font-medium">{stats.keepLimit}</p>
              </div>
              <div className="rounded-md border border-[var(--color-border)] px-3 py-2">
                <p className="text-[var(--color-muted-foreground)]">{t('settings.audit.newest')}</p>
                <p className="font-medium">
                  {stats.newestAt ? formatRelativeTime(auditEpochSeconds(stats.newestAt)) : '—'}
                </p>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
            {loading && events.length === 0 ? (
              <p className="px-3 py-4 text-[13px] text-[var(--color-muted-foreground)]">
                {t('common.loading')}
              </p>
            ) : events.length === 0 ? (
              <p className="px-3 py-4 text-[13px] text-[var(--color-muted-foreground)]">
                {t('settings.audit.empty')}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {events.map((event) => (
                  <li key={event.id} className="px-3 py-2.5 text-[13px]">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium text-[var(--color-foreground)]">
                        {event.action}
                        <span className="ml-2 font-normal text-[var(--color-muted-foreground)]">
                          {event.category}/{event.source}
                        </span>
                      </p>
                      <span className="text-[11px] text-[var(--color-muted-foreground)]">
                        {formatRelativeTime(auditEpochSeconds(event.createdAt))}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[var(--color-muted-foreground)]">{event.summary}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">
                      {event.outcome}
                      {event.actor ? ` · ${event.actor}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </SettingsSection>
  )
}
