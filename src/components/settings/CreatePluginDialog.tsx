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
  PLUGIN_CREATE_TEMPLATES,
  buildCreatedPlugin,
  slugifyPluginId,
  type PluginCreateTemplateId,
} from '@/lib/plugins/create'
import { installPluginRecord } from '@/lib/plugins/registry'
import type { PluginCategory } from '@/lib/plugins/types'
import { toast } from '@/lib/toast'

const CATEGORIES: PluginCategory[] = ['writing', 'study', 'workspace', 'other']

type CreatePluginDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (pluginId?: string) => void
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

export function CreatePluginDialog({ open, onOpenChange, onCreated }: CreatePluginDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [idTouched, setIdTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState<PluginCreateTemplateId>('command')
  const [category, setCategory] = useState<PluginCategory>('other')
  const [enableAfter, setEnableAfter] = useState(true)
  const [downloadPackage, setDownloadPackage] = useState(true)
  const [busy, setBusy] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setId('')
    setIdTouched(false)
    setDescription('')
    setTemplate('command')
    setCategory('other')
    setEnableAfter(true)
    setDownloadPackage(true)
    setBusy(false)
    setErrorKey(null)
  }, [open])

  useEffect(() => {
    if (!idTouched) setId(name.trim() ? slugifyPluginId(name) : '')
  }, [name, idTouched])

  const preview = useMemo(() => {
    if (!name.trim()) return null
    try {
      return buildCreatedPlugin({
        name,
        id: id.trim() || undefined,
        description,
        template,
        category,
      })
    } catch {
      return null
    }
  }, [name, id, description, template, category])

  async function handleCreate() {
    setErrorKey(null)
    setBusy(true)
    try {
      const built = buildCreatedPlugin({
        name,
        id: id.trim() || undefined,
        description,
        template,
        category,
      })

      await installPluginRecord(
        {
          ...built.record,
          manifest: {
            ...built.manifest,
            defaultEnabled: enableAfter,
          },
        },
        { enable: enableAfter },
      )

      if (downloadPackage) {
        const fileBase = built.manifest.id.replace(/[^a-z0-9.-]+/gi, '-')
        downloadText(`${fileBase}.scribe-ext.json`, built.packageJson)
      }

      toast.success(t('settings.plugins.create.successToast'), built.manifest.name)
      onCreated?.(built.manifest.id)
      onOpenChange(false)
    } catch (error) {
      const key = error instanceof Error ? error.message : 'unknown'
      const known = [
        'name_required',
        'id_required',
        'id_invalid',
        'id_taken',
      ].includes(key)
      setErrorKey(known ? key : 'unknown')
      toast.error(
        t('settings.plugins.create.errorToast'),
        known ? t(`settings.plugins.create.errors.${key}`) : String(error),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(88vh,720px)] max-w-[560px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('settings.plugins.create.title')}</DialogTitle>
          <DialogDescription>{t('settings.plugins.create.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3.5 py-1">
          <label className="flex flex-col gap-1.5 text-[12px]">
            <span className="font-medium text-[var(--color-foreground)]">
              {t('settings.plugins.create.nameLabel')}
            </span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('settings.plugins.create.namePlaceholder')}
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[12px]">
            <span className="font-medium text-[var(--color-foreground)]">
              {t('settings.plugins.create.idLabel')}
            </span>
            <Input
              value={id}
              onChange={(event) => {
                setIdTouched(true)
                setId(event.target.value)
              }}
              placeholder="local.my-plugin"
              spellCheck={false}
            />
            <span className="text-[11px] text-[var(--color-muted-foreground)]">
              {t('settings.plugins.create.idHint')}
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-[12px]">
            <span className="font-medium text-[var(--color-foreground)]">
              {t('settings.plugins.create.descriptionLabel')}
            </span>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('settings.plugins.create.descriptionPlaceholder')}
            />
          </label>

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-0.5 text-[12px] font-medium text-[var(--color-foreground)]">
              {t('settings.plugins.create.templateLabel')}
            </legend>
            <div className="grid gap-1.5">
              {PLUGIN_CREATE_TEMPLATES.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[12px] hover:bg-[var(--color-hover)]"
                >
                  <input
                    type="radio"
                    name="plugin-template"
                    className="mt-0.5"
                    checked={template === item.id}
                    onChange={() => setTemplate(item.id)}
                  />
                  <span>
                    <span className="block font-medium text-[var(--color-foreground)]">
                      {t(`settings.plugins.create.templates.${item.id}.label`)}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[var(--color-muted-foreground)]">
                      {t(`settings.plugins.create.templates.${item.id}.hint`)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1.5 text-[12px]">
            <span className="font-medium text-[var(--color-foreground)]">
              {t('settings.plugins.create.categoryLabel')}
            </span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as PluginCategory)}
              className="flex h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] text-[var(--color-foreground)] outline-none focus:border-[var(--color-accent)]"
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {t(`settings.plugins.categories.${value}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-[12px] text-[var(--color-foreground)]">
            <input
              type="checkbox"
              checked={enableAfter}
              onChange={(event) => setEnableAfter(event.target.checked)}
            />
            {t('settings.plugins.create.enableAfter')}
          </label>
          <label className="flex items-center gap-2 text-[12px] text-[var(--color-foreground)]">
            <input
              type="checkbox"
              checked={downloadPackage}
              onChange={(event) => setDownloadPackage(event.target.checked)}
            />
            {t('settings.plugins.create.downloadPackage')}
          </label>

          {preview && (
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] p-3">
              <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--color-muted-foreground)]">
                {t('settings.plugins.create.preview')}
              </p>
              <pre className="m-0 max-h-36 overflow-auto font-[family-name:var(--font-mono)] text-[11px] leading-relaxed text-[var(--color-foreground)]">
                {preview.code.trim()}
              </pre>
            </div>
          )}

          {errorKey && (
            <p className="m-0 text-[12px] text-[var(--color-destructive)]">
              {t(`settings.plugins.create.errors.${errorKey}`)}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={busy || !name.trim()} onClick={() => void handleCreate()}>
            {busy ? t('settings.plugins.create.creating') : t('settings.plugins.create.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
