import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, LockOpen, RefreshCw, ScrollText, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import {
  auditAdminChangePassword,
  auditAdminLock,
  auditAdminSetup,
  auditAdminStatus,
  auditAdminUnlock,
  clearAuditEvents,
  getAuditDbPath,
  getAuditSchemaVersion,
  listAuditEvents,
  type AuditAdminStatus,
  type AuditEvent,
} from '@/lib/db/api'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

type FilterSource = 'all' | 'tauri' | 'mcp' | 'system'
type FilterCategory =
  | 'all'
  | 'agent'
  | 'handoff'
  | 'mcp_tool'
  | 'prefs'
  | 'nlp'
  | 'admin'
  | 'security'

function formatTs(epoch: number): string {
  try {
    return new Date(epoch * 1000).toLocaleString()
  } catch {
    return String(epoch)
  }
}

function outcomeClass(outcome: string): string {
  if (outcome === 'error') return 'text-[var(--color-destructive)]'
  if (outcome === 'denied') return 'text-[color-mix(in_srgb,var(--color-accent)_80%,#b45309)]'
  return 'text-[var(--color-muted-foreground)]'
}

export function AuditSection() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<AuditAdminStatus | null>(null)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [dbPath, setDbPath] = useState<string | null>(null)
  const [schemaVersion, setSchemaVersion] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [source, setSource] = useState<FilterSource>('all')
  const [category, setCategory] = useState<FilterCategory>('all')

  async function refreshStatus() {
    const next = await auditAdminStatus()
    setStatus(next)
    return next
  }

  async function refreshEvents(unlocked: boolean) {
    if (!unlocked) {
      setEvents([])
      return
    }
    const list = await listAuditEvents({
      limit: 200,
      source: source === 'all' ? null : source,
      category: category === 'all' ? null : category,
    })
    setEvents(list)
  }

  async function bootstrap() {
    setLoading(true)
    try {
      const [next, path, version] = await Promise.all([
        refreshStatus(),
        getAuditDbPath(),
        getAuditSchemaVersion(),
      ])
      setDbPath(path)
      setSchemaVersion(version)
      await refreshEvents(next.unlocked)
    } catch (error) {
      toast.error(t('audit.loadError'), String(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void bootstrap()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])

  useEffect(() => {
    if (!status?.unlocked) return
    void refreshEvents(true).catch((error) => {
      toast.error(t('audit.loadError'), String(error))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters
  }, [source, category])

  const filtersDisabled = !status?.unlocked || busy

  const emptyLabel = useMemo(() => {
    if (loading) return t('audit.loading')
    if (!status?.unlocked) return t('audit.lockedEmpty')
    return t('audit.empty')
  }, [loading, status?.unlocked, t])

  async function handleSetup() {
    setBusy(true)
    try {
      const next = await auditAdminSetup(password)
      setStatus(next)
      setPassword('')
      await refreshEvents(true)
      toast.success(t('audit.setupDone'))
    } catch (error) {
      toast.error(t('audit.setupError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleUnlock() {
    setBusy(true)
    try {
      const next = await auditAdminUnlock(password)
      setStatus(next)
      setPassword('')
      await refreshEvents(true)
      toast.success(t('audit.unlockDone'))
    } catch (error) {
      toast.error(t('audit.unlockError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleLock() {
    setBusy(true)
    try {
      const next = await auditAdminLock()
      setStatus(next)
      setEvents([])
      toast.success(t('audit.lockDone'))
    } catch (error) {
      toast.error(t('audit.lockError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleChangePassword() {
    setBusy(true)
    try {
      const next = await auditAdminChangePassword(currentPassword, newPassword)
      setStatus(next)
      setCurrentPassword('')
      setNewPassword('')
      toast.success(t('audit.passwordChanged'))
    } catch (error) {
      toast.error(t('audit.passwordChangeError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleClear() {
    if (!window.confirm(t('audit.clearConfirm'))) return
    setBusy(true)
    try {
      const deleted = await clearAuditEvents()
      await refreshStatus()
      await refreshEvents(true)
      toast.success(t('audit.clearDone', { count: deleted }))
    } catch (error) {
      toast.error(t('audit.clearError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleRefresh() {
    setBusy(true)
    try {
      const next = await refreshStatus()
      await refreshEvents(next.unlocked)
    } catch (error) {
      toast.error(t('audit.loadError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SettingsSection>
        <SettingsSectionHeader
          title={t('audit.title')}
          description={t('audit.description')}
          actions={
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void handleRefresh()}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {t('audit.refresh')}
            </Button>
          }
        />

        <SettingsGroup>
          <SettingsRow
            title={t('audit.statusTitle')}
            description={t('audit.statusHint')}
          >
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-1 font-mono uppercase tracking-[0.06em]',
                  status?.unlocked
                    ? 'border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]',
                )}
              >
                {status?.unlocked ? (
                  <LockOpen className="h-3.5 w-3.5" />
                ) : (
                  <Lock className="h-3.5 w-3.5" />
                )}
                {status?.unlocked
                  ? t('audit.unlocked')
                  : t('audit.locked')}
              </span>
              <span className="text-[var(--color-muted-foreground)]">
                {t('audit.eventCount', { count: status?.eventCount ?? 0 })}
              </span>
            </div>
          </SettingsRow>

          <SettingsRow
            title={t('audit.dbPath')}
            description={dbPath ?? t('audit.dbPathUnknown')}
            layout="stack"
          />

          <SettingsRow title={t('audit.schemaVersion')}>
            <span className="font-mono text-[13px]">{schemaVersion ?? '—'}</span>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader
          title={
            status?.configured
              ? t('audit.gateTitle')
              : t('audit.setupTitle')
          }
          description={
            status?.configured
              ? t('audit.gateHint')
              : t('audit.setupHint')
          }
        />

        <SettingsGroup>
          {!status?.configured ? (
            <SettingsRow
              title={t('audit.setupPassword')}
              description={t('audit.setupPasswordHint')}
              layout="stack"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t('audit.passwordPlaceholder')}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || password.trim().length < 4}
                  onClick={() => void handleSetup()}
                >
                  {t('audit.setupAction')}
                </Button>
              </div>
            </SettingsRow>
          ) : status.unlocked ? (
            <>
              <SettingsRow
                title={t('audit.lockTitle')}
                description={t('audit.lockHint')}
              >
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void handleLock()}
                >
                  <Lock className="mr-1.5 h-3.5 w-3.5" />
                  {t('audit.lockAction')}
                </Button>
              </SettingsRow>
              <SettingsRow
                title={t('audit.changePassword')}
                description={t('audit.changePasswordHint')}
                layout="stack"
              >
                <div className="flex flex-col gap-2">
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder={t('audit.currentPasswordPlaceholder')}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder={t('audit.newPasswordPlaceholder')}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        busy ||
                        currentPassword.trim().length < 1 ||
                        newPassword.trim().length < 4
                      }
                      onClick={() => void handleChangePassword()}
                    >
                      {t('audit.changePasswordAction')}
                    </Button>
                  </div>
                </div>
              </SettingsRow>
            </>
          ) : (
            <SettingsRow
              title={t('audit.unlockTitle')}
              description={t('audit.unlockHint')}
              layout="stack"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t('audit.passwordPlaceholder')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && password.trim().length >= 4) {
                      void handleUnlock()
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || password.trim().length < 4}
                  onClick={() => void handleUnlock()}
                >
                  <LockOpen className="mr-1.5 h-3.5 w-3.5" />
                  {t('audit.unlockAction')}
                </Button>
              </div>
            </SettingsRow>
          )}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader
          title={t('audit.eventsTitle')}
          description={t('audit.eventsHint')}
          actions={
            status?.unlocked ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || (status.eventCount ?? 0) === 0}
                onClick={() => void handleClear()}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {t('audit.clear')}
              </Button>
            ) : null
          }
        />

        <div className="mb-3 flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-[12px] text-[var(--color-muted-foreground)]">
            {t('audit.filterSource')}
            <select
              className="h-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[12px] text-[var(--color-foreground)]"
              value={source}
              disabled={filtersDisabled}
              onChange={(event) => setSource(event.target.value as FilterSource)}
            >
              <option value="all">{t('audit.filterAll')}</option>
              <option value="tauri">tauri</option>
              <option value="mcp">mcp</option>
              <option value="system">system</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-[12px] text-[var(--color-muted-foreground)]">
            {t('audit.filterCategory')}
            <select
              className="h-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[12px] text-[var(--color-foreground)]"
              value={category}
              disabled={filtersDisabled}
              onChange={(event) => setCategory(event.target.value as FilterCategory)}
            >
              <option value="all">{t('audit.filterAll')}</option>
              <option value="agent">agent</option>
              <option value="handoff">handoff</option>
              <option value="mcp_tool">mcp_tool</option>
              <option value="prefs">prefs</option>
              <option value="nlp">nlp</option>
              <option value="admin">admin</option>
              <option value="security">security</option>
            </select>
          </label>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {events.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[13px] text-[var(--color-muted-foreground)]">
              <ScrollText className="h-5 w-5 opacity-50" />
              {emptyLabel}
            </div>
          ) : (
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
                <thead className="sticky top-0 bg-[color-mix(in_srgb,var(--color-sidebar-solid)_88%,transparent)] backdrop-blur-sm">
                  <tr className="border-b border-[var(--color-border)] font-mono text-[10px] uppercase tracking-[0.07em] text-[var(--color-muted-foreground)]">
                    <th className="px-3 py-2 font-medium">{t('audit.colTime')}</th>
                    <th className="px-3 py-2 font-medium">{t('audit.colSource')}</th>
                    <th className="px-3 py-2 font-medium">{t('audit.colCategory')}</th>
                    <th className="px-3 py-2 font-medium">{t('audit.colAction')}</th>
                    <th className="px-3 py-2 font-medium">{t('audit.colOutcome')}</th>
                    <th className="px-3 py-2 font-medium">{t('audit.colSummary')}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr
                      key={event.id}
                      className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-hover)]"
                    >
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-[var(--color-muted-foreground)]">
                        {formatTs(event.createdAt)}
                      </td>
                      <td className="px-3 py-2 font-mono">{event.source}</td>
                      <td className="px-3 py-2 font-mono">{event.category}</td>
                      <td className="px-3 py-2 font-mono">{event.action}</td>
                      <td className={cn('px-3 py-2 font-mono', outcomeClass(event.outcome))}>
                        {event.outcome}
                      </td>
                      <td className="max-w-[320px] truncate px-3 py-2" title={event.summary}>
                        {event.summary}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SettingsSection>
    </>
  )
}
