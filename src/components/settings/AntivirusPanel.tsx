import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoaderCircle, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react'
import {
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/SettingsPrimitives'
import { Button } from '@/components/ui/button'
import {
  antivirusListQuarantine,
  antivirusPurgeQuarantine,
  antivirusRestoreQuarantine,
  antivirusScanStorageTree,
  antivirusSelfTest,
  antivirusStatus,
  type AntivirusBatchReport,
  type AntivirusSelfTestReport,
  type AntivirusStatus,
  type QuarantineEntry,
} from '@/lib/db/api'
import {
  patchAntivirusPolicy,
  readAntivirusPolicy,
  type AntivirusPolicy,
} from '@/lib/antivirus/prefs'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

function StatusIcon({ status }: { status: AntivirusStatus | null }) {
  if (!status) return <ShieldOff className="h-4 w-4 opacity-50" />
  if (!status.available) return <ShieldOff className="h-4 w-4 text-[var(--color-muted-foreground)]" />
  return <ShieldCheck className="h-4 w-4 text-[var(--color-accent)]" />
}

export function AntivirusPanel() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<AntivirusStatus | null>(null)
  const [policy, setPolicy] = useState<AntivirusPolicy>(() => readAntivirusPolicy())
  const [selfTest, setSelfTest] = useState<AntivirusSelfTestReport | null>(null)
  const [batch, setBatch] = useState<AntivirusBatchReport | null>(null)
  const [quarantine, setQuarantine] = useState<QuarantineEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [nextStatus, nextQuarantine] = await Promise.all([
      antivirusStatus(),
      antivirusListQuarantine().catch(() => [] as QuarantineEntry[]),
    ])
    setStatus(nextStatus)
    setQuarantine(nextQuarantine)
  }, [])

  useEffect(() => {
    void refresh().catch(() => setStatus(null))
  }, [refresh])

  function updatePolicy(patch: Partial<AntivirusPolicy>) {
    setPolicy(patchAntivirusPolicy(patch))
  }

  async function runSelfTest() {
    setBusy('selfTest')
    try {
      const report = await antivirusSelfTest()
      setSelfTest(report)
      if (report.passed) toast.success(t('settings.antivirus.selfTestOk'))
      else toast.error(t('settings.antivirus.selfTestFail'), report.detail)
    } catch (error) {
      toast.error(t('settings.antivirus.selfTestFail'), String(error))
    } finally {
      setBusy(null)
    }
  }

  async function scanInbox() {
    setBusy('scan')
    try {
      const report = await antivirusScanStorageTree({
        path: 'inbox',
        recursive: true,
        maxFiles: 100,
      })
      setBatch(report)
      if (report.infected > 0) {
        toast.error(
          t('settings.antivirus.scanInfected', { count: report.infected }),
          t('settings.antivirus.scanSummary', {
            scanned: report.scanned,
            clean: report.clean,
          }),
        )
      } else {
        toast.success(
          t('settings.antivirus.scanClean'),
          t('settings.antivirus.scanSummary', {
            scanned: report.scanned,
            clean: report.clean,
          }),
        )
      }
      await refresh()
    } catch (error) {
      toast.error(t('settings.antivirus.scanError'), String(error))
    } finally {
      setBusy(null)
    }
  }

  async function restoreItem(id: string) {
    setBusy(`restore:${id}`)
    try {
      const path = await antivirusRestoreQuarantine(id)
      toast.success(t('settings.antivirus.restoreOk'), path)
      await refresh()
    } catch (error) {
      toast.error(t('settings.antivirus.restoreError'), String(error))
    } finally {
      setBusy(null)
    }
  }

  async function purgeItem(id: string) {
    setBusy(`purge:${id}`)
    try {
      await antivirusPurgeQuarantine(id)
      toast.success(t('settings.antivirus.purgeOk'))
      await refresh()
    } catch (error) {
      toast.error(t('settings.antivirus.purgeError'), String(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <SettingsGroup className="mt-4">
      <SettingsRow
        title={t('settings.antivirus.title')}
        description={t('settings.antivirus.description')}
        layout="stack"
      />
      <SettingsRow
        title={t('settings.antivirus.engine')}
        description={
          status
            ? status.available
              ? `${status.engine}${status.version ? ` · ${status.version}` : ''}`
              : status.installHint
            : t('settings.antivirus.loading')
        }
      >
        <div className="flex items-center gap-2">
          <StatusIcon status={status} />
          <Button type="button" size="sm" variant="outline" onClick={() => void refresh()} disabled={busy != null}>
            {t('settings.antivirus.refresh')}
          </Button>
        </div>
      </SettingsRow>

      <SettingsRow
        title={t('settings.antivirus.enabled')}
        description={t('settings.antivirus.enabledHint')}
      >
        <Button
          type="button"
          size="sm"
          variant={policy.enabled ? 'default' : 'outline'}
          onClick={() => updatePolicy({ enabled: !policy.enabled })}
        >
          {policy.enabled ? t('settings.storage.autoSyncOn') : t('settings.storage.autoSyncOff')}
        </Button>
      </SettingsRow>

      <SettingsRow
        title={t('settings.antivirus.scanOnImport')}
        description={t('settings.antivirus.scanOnImportHint')}
      >
        <Button
          type="button"
          size="sm"
          variant={policy.scanOnImport ? 'default' : 'outline'}
          disabled={!policy.enabled}
          onClick={() => updatePolicy({ scanOnImport: !policy.scanOnImport })}
        >
          {policy.scanOnImport ? t('settings.storage.autoSyncOn') : t('settings.storage.autoSyncOff')}
        </Button>
      </SettingsRow>

      <SettingsRow
        title={t('settings.antivirus.quarantineInfected')}
        description={t('settings.antivirus.quarantineInfectedHint')}
      >
        <Button
          type="button"
          size="sm"
          variant={policy.quarantineInfected ? 'default' : 'outline'}
          disabled={!policy.enabled}
          onClick={() => updatePolicy({ quarantineInfected: !policy.quarantineInfected })}
        >
          {policy.quarantineInfected
            ? t('settings.storage.autoSyncOn')
            : t('settings.storage.autoSyncOff')}
        </Button>
      </SettingsRow>

      <SettingsRow
        title={t('settings.antivirus.actions')}
        description={t('settings.antivirus.actionsHint')}
      >
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" disabled={busy != null} onClick={() => void runSelfTest()}>
            {busy === 'selfTest' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
            {t('settings.antivirus.selfTest')}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy != null} onClick={() => void scanInbox()}>
            {busy === 'scan' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
            {t('settings.antivirus.scanInbox')}
          </Button>
        </div>
      </SettingsRow>

      {selfTest ? (
        <p
          className={cn(
            'px-1 text-[12.5px] leading-snug',
            selfTest.passed ? 'text-[var(--color-muted-foreground)]' : 'text-[var(--color-danger,var(--color-accent))]',
          )}
        >
          {selfTest.detail}
        </p>
      ) : null}

      {batch ? (
        <p className="px-1 text-[12.5px] text-[var(--color-muted-foreground)]">
          {t('settings.antivirus.scanSummary', {
            scanned: batch.scanned,
            clean: batch.clean,
          })}
          {batch.infected > 0
            ? ` · ${t('settings.antivirus.scanInfected', { count: batch.infected })}`
            : ''}
        </p>
      ) : null}

      {quarantine.length > 0 ? (
        <div className="mt-1 space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
            <ShieldAlert className="h-3.5 w-3.5" />
            {t('settings.antivirus.quarantineTitle', { count: quarantine.length })}
          </p>
          <ul className="space-y-2">
            {quarantine.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2 first:border-0 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px]">{item.originalPath}</p>
                  <p className="truncate text-[11.5px] text-[var(--color-muted-foreground)]">
                    {item.threatName ?? item.reason}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy != null}
                    onClick={() => void restoreItem(item.id)}
                  >
                    {t('settings.antivirus.restore')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy != null}
                    onClick={() => void purgeItem(item.id)}
                  >
                    {t('settings.antivirus.purge')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SettingsGroup>
  )
}
