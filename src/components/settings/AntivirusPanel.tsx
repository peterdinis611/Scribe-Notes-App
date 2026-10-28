import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoaderCircle, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react'
import {
  SettingsGroup,
  SettingsRow,
  SettingsToggle,
} from '@/components/settings/SettingsPrimitives'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  antivirusListQuarantine,
  antivirusPickAndScan,
  antivirusPurgeAllQuarantine,
  antivirusPurgeQuarantine,
  antivirusRestoreQuarantine,
  antivirusScanStorageTree,
  antivirusSelfTest,
  antivirusStatus,
  type AntivirusBatchReport,
  type AntivirusScanReport,
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

function reportBatchToast(
  t: (key: string, options?: Record<string, unknown>) => string,
  report: AntivirusBatchReport,
  cleanKey: string,
) {
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
      t(cleanKey),
      t('settings.antivirus.scanSummary', {
        scanned: report.scanned,
        clean: report.clean,
      }),
    )
  }
}

export function AntivirusPanel() {
  const { t } = useTranslation()
  const onLabel = t('settings.storage.autoSyncOn')
  const offLabel = t('settings.storage.autoSyncOff')
  const [status, setStatus] = useState<AntivirusStatus | null>(null)
  const [policy, setPolicy] = useState<AntivirusPolicy>(() => readAntivirusPolicy())
  const [selfTest, setSelfTest] = useState<AntivirusSelfTestReport | null>(null)
  const [batch, setBatch] = useState<AntivirusBatchReport | null>(null)
  const [pickedScan, setPickedScan] = useState<AntivirusScanReport | null>(null)
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

  async function runTreeScan(path: string | null, busyKey: string, cleanKey: string) {
    setBusy(busyKey)
    try {
      const report = await antivirusScanStorageTree({
        path,
        recursive: true,
        maxFiles: path ? 100 : 300,
      })
      setBatch(report)
      reportBatchToast(t, report, cleanKey)
      await refresh()
    } catch (error) {
      toast.error(t('settings.antivirus.scanError'), String(error))
    } finally {
      setBusy(null)
    }
  }

  async function pickAndScan() {
    setBusy('pick')
    try {
      const report = await antivirusPickAndScan()
      if (!report) return
      setPickedScan(report)
      if (report.verdict === 'infected') {
        toast.error(
          t('settings.antivirus.pickInfected'),
          report.threats[0]?.name ?? report.rawSummary,
        )
      } else if (report.verdict === 'clean') {
        toast.success(t('settings.antivirus.pickClean'), report.path)
      } else {
        toast.info(t('settings.antivirus.pickOther'), report.rawSummary || report.verdict)
      }
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

  async function purgeAll() {
    setBusy('purgeAll')
    try {
      const n = await antivirusPurgeAllQuarantine()
      toast.success(t('settings.antivirus.purgeAllOk', { count: n }))
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
          status ? (
            status.available ? (
              `${status.engine}${status.version ? ` · ${status.version}` : ''}`
            ) : (
              status.installHint
            )
          ) : (
            <div className="mt-1 flex flex-col gap-1.5">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          )
        }
      >
        <div className="flex items-center gap-2">
          <StatusIcon status={status} />
          <Button type="button" size="sm" variant="outline" onClick={() => void refresh()} disabled={busy != null}>
            {t('settings.antivirus.refresh')}
          </Button>
        </div>
      </SettingsRow>

      <SettingsRow title={t('settings.antivirus.enabled')} description={t('settings.antivirus.enabledHint')}>
        <SettingsToggle
          checked={policy.enabled}
          onChange={() => updatePolicy({ enabled: !policy.enabled })}
          onLabel={onLabel}
          offLabel={offLabel}
        />
      </SettingsRow>

      <SettingsRow
        title={t('settings.antivirus.scanOnImport')}
        description={t('settings.antivirus.scanOnImportHint')}
      >
        <SettingsToggle
          checked={policy.scanOnImport}
          onChange={() => updatePolicy({ scanOnImport: !policy.scanOnImport })}
          disabled={!policy.enabled}
          onLabel={onLabel}
          offLabel={offLabel}
        />
      </SettingsRow>

      <SettingsRow
        title={t('settings.antivirus.blockInfected')}
        description={t('settings.antivirus.blockInfectedHint')}
      >
        <SettingsToggle
          checked={policy.blockInfected}
          onChange={() => updatePolicy({ blockInfected: !policy.blockInfected })}
          disabled={!policy.enabled}
          onLabel={onLabel}
          offLabel={offLabel}
        />
      </SettingsRow>

      <SettingsRow
        title={t('settings.antivirus.quarantineInfected')}
        description={t('settings.antivirus.quarantineInfectedHint')}
      >
        <SettingsToggle
          checked={policy.quarantineInfected}
          onChange={() => updatePolicy({ quarantineInfected: !policy.quarantineInfected })}
          disabled={!policy.enabled}
          onLabel={onLabel}
          offLabel={offLabel}
        />
      </SettingsRow>

      <SettingsRow
        title={t('settings.antivirus.warnIfUnavailable')}
        description={t('settings.antivirus.warnIfUnavailableHint')}
      >
        <SettingsToggle
          checked={policy.warnIfUnavailable}
          onChange={() => updatePolicy({ warnIfUnavailable: !policy.warnIfUnavailable })}
          disabled={!policy.enabled}
          onLabel={onLabel}
          offLabel={offLabel}
        />
      </SettingsRow>

      <div className="px-4 py-2">
        <Separator />
      </div>

      <SettingsRow
        title={t('settings.antivirus.actions')}
        description={t('settings.antivirus.actionsHint')}
        layout="stack"
      >
        <div className="flex w-full flex-col gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="outline" disabled={busy != null} onClick={() => void runSelfTest()}>
              {busy === 'selfTest' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('settings.antivirus.selfTest')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy != null}
              onClick={() => void runTreeScan('inbox', 'scanInbox', 'settings.antivirus.scanClean')}
            >
              {busy === 'scanInbox' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('settings.antivirus.scanInbox')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy != null}
              onClick={() => void runTreeScan(null, 'scanAll', 'settings.antivirus.scanAllClean')}
            >
              {busy === 'scanAll' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('settings.antivirus.scanAll')}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy != null} onClick={() => void pickAndScan()}>
              {busy === 'pick' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('settings.antivirus.pickScan')}
            </Button>
          </div>
          {busy === 'scanInbox' || busy === 'scanAll' || busy === 'pick' || busy === 'selfTest' ? (
            <Progress aria-label={t('settings.antivirus.actions')} className="h-1.5" />
          ) : null}
        </div>
      </SettingsRow>

      {selfTest ? (
        <p
          className={cn(
            'm-0 border-b border-[var(--color-border)] px-4 py-2 text-[12.5px] leading-snug',
            selfTest.passed
              ? 'text-[var(--color-muted-foreground)]'
              : 'text-[var(--color-destructive)]',
          )}
        >
          {selfTest.detail}
        </p>
      ) : null}

      {pickedScan ? (
        <p className="m-0 border-b border-[var(--color-border)] px-4 py-2 text-[12.5px] text-[var(--color-muted-foreground)]">
          {t('settings.antivirus.pickResult', {
            verdict: pickedScan.verdict,
            path: pickedScan.path,
          })}
        </p>
      ) : null}

      {batch ? (
        <p className="m-0 border-b border-[var(--color-border)] px-4 py-2 text-[12.5px] text-[var(--color-muted-foreground)]">
          {t('settings.antivirus.scanSummary', {
            scanned: batch.scanned,
            clean: batch.clean,
          })}
          {batch.infected > 0
            ? ` · ${t('settings.antivirus.scanInfected', { count: batch.infected })}`
            : ''}
          {batch.unavailable > 0
            ? ` · ${t('settings.antivirus.scanUnavailable', { count: batch.unavailable })}`
            : ''}
        </p>
      ) : null}

      {quarantine.length > 0 ? (
        <div className="space-y-2 px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
              <ShieldAlert className="h-3.5 w-3.5" />
              {t('settings.antivirus.quarantineTitle', { count: quarantine.length })}
            </p>
            <Button type="button" size="sm" variant="outline" disabled={busy != null} onClick={() => void purgeAll()}>
              {busy === 'purgeAll' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('settings.antivirus.purgeAll')}
            </Button>
          </div>
          <ul className="m-0 space-y-2 p-0">
            {quarantine.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2 first:border-0 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="m-0 truncate text-[13px]">{item.originalPath}</p>
                  <p className="m-0 truncate text-[11.5px] text-[var(--color-muted-foreground)]">
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
