import { useAtomValue } from 'jotai'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { dismissToast, toastsAtom, type ToastVariant } from '@/lib/toast'
import { cn } from '@/lib/utils'

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') {
    return <CheckCircle2 className="toast-icon toast-icon--success" aria-hidden="true" />
  }
  if (variant === 'error') {
    return <XCircle className="toast-icon toast-icon--error" aria-hidden="true" />
  }
  if (variant === 'info') {
    return <Info className="toast-icon toast-icon--info" aria-hidden="true" />
  }
  return null
}

export function ToastHost() {
  const toasts = useAtomValue(toastsAtom)

  if (toasts.length === 0) return null

  return (
    <div className="toast-host titlebar-no-drag" aria-live="polite" aria-relevant="additions">
      {toasts.map((item) => (
        <div key={item.id} className={cn('toast-item', `toast-item--${item.variant}`)} role="status">
          <ToastIcon variant={item.variant} />
          <div className="toast-item-body">
            <p className="toast-item-title">{item.title}</p>
            {item.description && <p className="toast-item-desc">{item.description}</p>}
          </div>
          <button
            type="button"
            className="toast-item-close"
            aria-label="Zavrieť"
            onClick={() => dismissToast(item.id)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
