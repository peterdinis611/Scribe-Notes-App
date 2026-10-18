import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { dismissToast, runToastAction, type ToastVariant } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { IconTooltip } from '@/components/ui/tooltip'
import { useAppSelector } from '@/store/hooks'

function ToastIcon({ variant }: { variant: ToastVariant }) {
  const className = 'h-4 w-4 shrink-0'
  if (variant === 'success') {
    return <CheckCircle2 className={cn(className, 'text-[var(--color-accent)]')} aria-hidden="true" />
  }
  if (variant === 'error') {
    return <XCircle className={cn(className, 'text-[var(--color-destructive)]')} aria-hidden="true" />
  }
  if (variant === 'info') {
    return <Info className={cn(className, 'text-[var(--color-accent)]')} aria-hidden="true" />
  }
  return null
}

const toastVariantClass: Record<ToastVariant, string> = {
  default: 'border-[var(--color-border)]',
  success: 'border-[color-mix(in_srgb,var(--color-accent)_28%,var(--color-border))]',
  error: 'border-[color-mix(in_srgb,var(--color-destructive)_28%,var(--color-border))]',
  info: 'border-[color-mix(in_srgb,var(--color-accent)_28%,var(--color-border))]',
}

export function ToastHost() {
  const { t } = useTranslation()
  const toasts = useAppSelector((state) => state.ui.toasts)

  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2 titlebar-no-drag"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          className={cn(
            'pointer-events-auto flex items-start gap-2.5 rounded-[var(--radius-md)] border bg-[var(--color-background)] p-3 shadow-[0_8px_24px_rgba(15,15,15,0.12)]',
            toastVariantClass[item.variant],
          )}
          role="status"
        >
          <ToastIcon variant={item.variant} />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[13px] font-semibold tracking-[-0.01em] text-[var(--color-foreground)]">
              {item.title}
            </p>
            {item.description && (
              <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-muted-foreground)]">
                {item.description}
              </p>
            )}
            {item.actionLabel && (
              <button
                type="button"
                className="mt-2 inline-flex h-7 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-[11px] font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-hover)]"
                onClick={() => runToastAction(item.id)}
              >
                {item.actionLabel}
              </button>
            )}
          </div>
          <IconTooltip label={t('common.close')}>
            <button
              type="button"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]"
              aria-label={t('common.close')}
              onClick={() => dismissToast(item.id)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </IconTooltip>
        </div>
      ))}
    </div>
  )
}
