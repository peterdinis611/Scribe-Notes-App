import { Download } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  bumpSemver,
  exportPluginPackage,
  getInstalledPluginRecord,
  listPluginVersionHistory,
  publishPluginVersion,
  restorePluginVersion,
  type VersionBump,
} from '@/lib/plugins'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

type EditPluginDialogProps = {
  pluginId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated?: (pluginId: string) => void
}

function downloadText(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function EditPluginDialog({
  pluginId,
  open,
  onOpenChange,
  onUpdated,
}: EditPluginDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')
  const [bump, setBump] = useState<VersionBump>('patch')
  const [customVersion, setCustomVersion] = useState('')
  const [useCustomVersion, setUseCustomVersion] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [historyTick, setHistoryTick] = useState(0)

  const record = useMemo(
    () => (pluginId ? getInstalledPluginRecord(pluginId) : null),
    [pluginId, open, historyTick],
  )
  const history = useMemo(
    () => (pluginId ? listPluginVersionHistory(pluginId) : []),
    [pluginId, open, historyTick],
  )

  useEffect(() => {
    if (!open || !record) return
    setName(record.manifest.name)
    setDescription(record.manifest.description ?? '')
    setCode(record.code)
    setNote('')
    setBump('patch')
    setCustomVersion(bumpSemver(record.manifest.version, 'patch'))
    setUseCustomVersion(false)
    setBusy(false)
    setErrorKey(null)
  }, [open, record])

  const nextVersion = useMemo(() => {
    if (!record) return '1.0.0'
    if (useCustomVersion) return customVersion.trim() || record.manifest.version
    return bumpSemver(record.manifest.version, bump)
  }, [record, useCustomVersion, customVersion, bump])

  async function handlePublish() {
    if (!pluginId || !record) return
    setBusy(true)
    setErrorKey(null)
    try {
      const entry = await publishPluginVersion({
        pluginId,
        code,
        bump,
        version: useCustomVersion ? customVersion.trim() : undefined,
        note: note.trim() || undefined,
        name,
        description,
      })
      toast.success(
        t('settings.plugins.edit.publishToast'),
        `${entry.manifest.name} · v${entry.manifest.version}`,
      )
      setHistoryTick((n) => n + 1)
      onUpdated?.(pluginId)
      onOpenChange(false)
    } catch (error) {
      const key = error instanceof Error ? error.message : 'unknown'
      const known = [
        'version_required',
        'version_invalid',
        'code_required',
        'no_changes',
        'not_installed',
        'record_missing',
      ].includes(key)
      setErrorKey(known ? key : 'unknown')
      toast.error(
        t('settings.plugins.edit.publishError'),
        known ? t(`settings.plugins.edit.errors.${key}`) : String(error),
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore(version: string) {
    if (!pluginId) return
    setBusy(true)
    try {
      const entry = await restorePluginVersion(pluginId, version, {
        bump: 'patch',
        note: `Restored from v${version}`,
      })
      toast.success(
        t('settings.plugins.edit.restoreToast'),
        `${entry.manifest.name} · v${entry.manifest.version}`,
      )
      setHistoryTick((n) => n + 1)
      onUpdated?.(pluginId)
      const next = getInstalledPluginRecord(pluginId)
      if (next) {
        setName(next.manifest.name)
        setDescription(next.manifest.description ?? '')
        setCode(next.code)
        setBump('patch')
        setCustomVersion(bumpSemver(next.manifest.version, 'patch'))
      }
    } catch (error) {
      toast.error(t('settings.plugins.edit.restoreError'), String(error))
    } finally {
      setBusy(false)
    }
  }

  function handleExport() {
    if (!record) return
    const fileBase = record.manifest.id.replace(/[^a-z0-9.-]+/gi, '-')
    downloadText(
      `${fileBase}-v${record.manifest.version}.scribe-ext.json`,
      exportPluginPackage(record),
    )
    toast.success(t('settings.plugins.edit.exportToast'), record.manifest.id)
  }

  if (!pluginId) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92vh,820px)] max-w-[720px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('settings.plugins.edit.title')}</DialogTitle>
          <DialogDescription>
            {t('settings.plugins.edit.description', {
              id: pluginId,
              version: record?.manifest.version ?? '—',
            })}
          </DialogDescription>
        </DialogHeader>

        {!record ? (
          <p className="text-[12px] text-[var(--color-destructive)]">
            {t('settings.plugins.edit.errors.record_missing')}
          </p>
        ) : (
          <div className="flex flex-col gap-3.5 py-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-[12px]">
                <span className="font-medium">{t('settings.plugins.create.nameLabel')}</span>
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-[12px]">
                <span className="font-medium">{t('settings.plugins.edit.currentVersion')}</span>
                <Input value={`v${record.manifest.version}`} readOnly />
              </label>
            </div>

            <label className="flex flex-col gap-1.5 text-[12px]">
              <span className="font-medium">{t('settings.plugins.create.descriptionLabel')}</span>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('settings.plugins.create.descriptionPlaceholder')}
              />
            </label>

            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-1.5 text-[12px] font-medium">
                {t('settings.plugins.edit.bumpLabel')}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {(['patch', 'minor', 'major', 'keep'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      'plugin-ext-chip',
                      !useCustomVersion && bump === value && 'is-active',
                    )}
                    onClick={() => {
                      setUseCustomVersion(false)
                      setBump(value)
                      setCustomVersion(bumpSemver(record.manifest.version, value))
                    }}
                  >
                    {t(`settings.plugins.edit.bumps.${value}`)}
                    {value !== 'keep' ? ` → ${bumpSemver(record.manifest.version, value)}` : ''}
                  </button>
                ))}
                <button
                  type="button"
                  className={cn('plugin-ext-chip', useCustomVersion && 'is-active')}
                  onClick={() => setUseCustomVersion(true)}
                >
                  {t('settings.plugins.edit.bumps.custom')}
                </button>
              </div>
              {useCustomVersion && (
                <Input
                  className="mt-2"
                  value={customVersion}
                  onChange={(event) => setCustomVersion(event.target.value)}
                  placeholder="1.2.0"
                  spellCheck={false}
                />
              )}
              <p className="mt-1.5 text-[11px] text-[var(--color-muted-foreground)]">
                {t('settings.plugins.edit.nextVersion', { version: nextVersion })}
              </p>
            </fieldset>

            <label className="flex flex-col gap-1.5 text-[12px]">
              <span className="font-medium">{t('settings.plugins.edit.noteLabel')}</span>
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t('settings.plugins.edit.notePlaceholder')}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-[12px]">
              <span className="font-medium">{t('settings.plugins.edit.codeLabel')}</span>
              <textarea
                value={code}
                onChange={(event) => setCode(event.target.value)}
                spellCheck={false}
                className="plugin-edit-code"
                rows={14}
              />
              <span className="text-[11px] text-[var(--color-muted-foreground)]">
                {t('settings.plugins.edit.codeHint')}
              </span>
            </label>

            <div className="plugin-edit-history">
              <div className="plugin-edit-history-head">
                <h3>{t('settings.plugins.edit.historyTitle')}</h3>
                <Button type="button" size="sm" variant="outline" onClick={handleExport}>
                  <Download className="h-3.5 w-3.5" />
                  {t('settings.plugins.edit.export')}
                </Button>
              </div>
              {history.length <= 1 ? (
                <p className="m-0 text-[12px] text-[var(--color-muted-foreground)]">
                  {t('settings.plugins.edit.historyEmpty')}
                </p>
              ) : (
                <ul className="plugin-edit-history-list">
                  {history.map((snap, index) => (
                    <li key={`${snap.version}-${snap.savedAt}-${index}`}>
                      <div>
                        <strong>v{snap.version}</strong>
                        {index === 0 ? (
                          <span className="plugin-ext-badge is-on">
                            {t('settings.plugins.edit.current')}
                          </span>
                        ) : null}
                        <p className="m-0 text-[11px] text-[var(--color-muted-foreground)]">
                          {snap.savedAt.slice(0, 19).replace('T', ' ')}
                          {snap.note ? ` · ${snap.note}` : ''}
                        </p>
                      </div>
                      {index > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void handleRestore(snap.version)}
                        >
                          {t('settings.plugins.edit.restore')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {errorKey && (
              <p className="m-0 text-[12px] text-[var(--color-destructive)]">
                {t(`settings.plugins.edit.errors.${errorKey}`)}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={busy || !record} onClick={() => void handlePublish()}>
            {busy
              ? t('settings.plugins.edit.publishing')
              : t('settings.plugins.edit.publish', { version: nextVersion })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
