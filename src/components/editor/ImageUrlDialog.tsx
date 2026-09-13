import { useEffect, useId, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { isLikelyImageUrl } from '@/lib/editor/image-utils'

type ImageUrlDialogProps = {
  open: boolean
  initialUrl?: string
  onClose: () => void
  onSubmit: (url: string) => void
}

export function ImageUrlDialog({ open, initialUrl = '', onClose, onSubmit }: ImageUrlDialogProps) {
  const { t } = useTranslation()
  const inputId = useId()
  const [url, setUrl] = useState(initialUrl)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (open) {
      setUrl(initialUrl)
      setError(false)
    }
  }, [initialUrl, open])

  function submit() {
    const trimmed = url.trim()
    if (!trimmed || (!isLikelyImageUrl(trimmed) && !/^https?:\/\//i.test(trimmed))) {
      setError(true)
      return
    }
    onSubmit(trimmed)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent showClose className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('image.urlTitle')}</DialogTitle>
          <DialogDescription>{t('image.urlHint')}</DialogDescription>
        </DialogHeader>
        <label className="grid gap-1.5 text-[12px] text-[var(--color-muted-foreground)]" htmlFor={inputId}>
          {t('image.urlLabel')}
          <Input
            id={inputId}
            autoFocus
            value={url}
            placeholder="https://"
            aria-invalid={error}
            onChange={(event) => {
              setUrl(event.target.value)
              setError(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              }
            }}
          />
          {error ? (
            <span className="text-[12px] text-[#dc2626]">{t('image.urlInvalid')}</span>
          ) : null}
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" size="sm" onClick={submit}>
            {t('image.urlInsert')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
