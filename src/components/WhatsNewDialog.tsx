import { FileDown, Package, Trash2 } from 'lucide-react'
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
import { APP_VERSION } from '@/lib/app-version'
import { persistWhatsNewVersion } from '@/store/persistence'

const HIGHLIGHTS = [
  { id: 'v1Release', icon: Package },
  { id: 'nativePdf', icon: FileDown },
  { id: 'reliableTrash', icon: Trash2 },
] as const

type WhatsNewDialogProps = {
  open: boolean
  onClose: () => void
}

export function WhatsNewDialog({ open, onClose }: WhatsNewDialogProps) {
  const { t } = useTranslation()

  function handleClose() {
    persistWhatsNewVersion(APP_VERSION)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-[500px] shadow-[inset_3px_0_0_0_var(--color-accent)]" showClose>
        <DialogHeader>
          <p className="m-0 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-accent)]">
            {t('whatsNew.badge', { version: APP_VERSION })}
          </p>
          <DialogTitle className="font-[family-name:var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]">
            {t('whatsNew.title')}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            {t('whatsNew.subtitle')}
          </DialogDescription>
        </DialogHeader>

        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {HIGHLIGHTS.map(({ id, icon: Icon }) => (
            <li
              key={id}
              className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5"
            >
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface))] text-[var(--color-accent)]">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-[var(--color-foreground)]">
                  {t(`whatsNew.${id}.title`)}
                </span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
                  {t(`whatsNew.${id}.description`)}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button type="button" variant="default" size="sm" onClick={handleClose}>
            {t('whatsNew.gotIt')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
