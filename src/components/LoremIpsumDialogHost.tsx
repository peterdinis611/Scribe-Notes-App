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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  generateLoremIpsum,
  loadLoremOptions,
  normalizeLoremOptions,
  type LoremOptions,
  type LoremUnit,
} from '@/lib/editor/lorem-ipsum'
import { resolveLoremDialog } from '@/lib/lorem-dialog'
import { useAppSelector } from '@/store/hooks'

export function LoremIpsumDialogHost() {
  const { t } = useTranslation()
  const open = useAppSelector((state) => state.ui.loremDialog.open)
  const [options, setOptions] = useState<LoremOptions>(() => loadLoremOptions())

  useEffect(() => {
    if (!open) return
    setOptions(loadLoremOptions())
  }, [open])

  function close(result: LoremOptions | null) {
    resolveLoremDialog(result)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    close(normalizeLoremOptions(options))
  }

  const preview = generateLoremIpsum({
    ...options,
    count: options.unit === 'words' ? Math.min(options.count, 24) : Math.min(options.count, 2),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close(null)
      }}
    >
      {open && (
        <DialogContent className="max-w-[420px] titlebar-no-drag" showClose>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t('lorem.title')}</DialogTitle>
              <DialogDescription>{t('lorem.description')}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              <label className="grid gap-1.5 text-[12px]">
                <span className="font-medium text-[var(--color-foreground)]">{t('lorem.unit')}</span>
                <Select
                  value={options.unit}
                  onValueChange={(value) =>
                    setOptions((prev) =>
                      normalizeLoremOptions({ ...prev, unit: value as LoremUnit }),
                    )
                  }
                >
                  <SelectTrigger aria-label={t('lorem.unit')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paragraphs">{t('lorem.units.paragraphs')}</SelectItem>
                    <SelectItem value="sentences">{t('lorem.units.sentences')}</SelectItem>
                    <SelectItem value="words">{t('lorem.units.words')}</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="grid gap-1.5 text-[12px]">
                <span className="font-medium text-[var(--color-foreground)]">{t('lorem.count')}</span>
                <Input
                  type="number"
                  min={1}
                  max={options.unit === 'paragraphs' ? 20 : options.unit === 'sentences' ? 60 : 200}
                  value={options.count}
                  onChange={(event) =>
                    setOptions((prev) =>
                      normalizeLoremOptions({
                        ...prev,
                        count: Number(event.target.value),
                      }),
                    )
                  }
                />
              </label>

              <label className="flex items-center gap-2 text-[12px] text-[var(--color-foreground)]">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--color-accent)]"
                  checked={options.startWithLorem}
                  onChange={(event) =>
                    setOptions((prev) => ({
                      ...prev,
                      startWithLorem: event.target.checked,
                    }))
                  }
                />
                {t('lorem.startWithLorem')}
              </label>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="m-0 mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                {t('lorem.preview')}
              </p>
              <p className="m-0 line-clamp-4 text-[12px] leading-relaxed text-[var(--color-foreground)]">
                {preview}
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => close(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="default" size="sm">
                {t('lorem.insert')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
