import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const MODELS = ['tiny', 'base', 'small', 'medium'] as const
const LANGUAGES = [
  { value: '', labelKey: 'video.transcribeLangAuto' },
  { value: 'sk', labelKey: 'video.transcribeLangSk' },
  { value: 'en', labelKey: 'video.transcribeLangEn' },
  { value: 'cs', labelKey: 'video.transcribeLangCs' },
  { value: 'de', labelKey: 'video.transcribeLangDe' },
] as const

export type VideoTranscribeOptions = {
  model: string
  language: string | null
}

type Props = {
  open: boolean
  busy?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (options: VideoTranscribeOptions) => void
}

/** Single dialog for ASR model + language (replaces chained prompt inputs). */
export function VideoTranscribeDialog({ open, busy, onOpenChange, onConfirm }: Props) {
  const { t } = useTranslation()
  const [model, setModel] = useState<string>('base')
  const [language, setLanguage] = useState('')

  useEffect(() => {
    if (!open) return
    setModel('base')
    setLanguage('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="titlebar-no-drag max-w-md" showClose>
        <DialogHeader>
          <DialogTitle>{t('video.transcribe')}</DialogTitle>
          <DialogDescription>{t('video.transcribeDialogHint')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <label className="flex flex-col gap-1.5 text-[12px] text-[var(--color-muted-foreground)]">
            <span>{t('video.transcribeModel')}</span>
            <select
              className="h-9 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[13px] text-[var(--color-foreground)]"
              value={model}
              disabled={busy}
              onChange={(event) => setModel(event.target.value)}
            >
              {MODELS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[12px] text-[var(--color-muted-foreground)]">
            <span>{t('video.transcribeLanguage')}</span>
            <select
              className="h-9 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[13px] text-[var(--color-foreground)]"
              value={language}
              disabled={busy}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {LANGUAGES.map((row) => (
                <option key={row.value || 'auto'} value={row.value}>
                  {t(row.labelKey)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() =>
              onConfirm({
                model: model.trim() || 'base',
                language: language.trim() || null,
              })
            }
          >
            {busy ? t('common.loading') : t('video.transcribe')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
