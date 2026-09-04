import { store } from '@/store/index'
import { dismissToast as dismissToastAction, pushToast } from '@/store/uiSlice'

export type ToastVariant = 'default' | 'success' | 'error' | 'info'

export type ToastItem = {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  actionLabel?: string
}

/** Non-serializable click handlers keyed by toast id (kept outside Redux). */
const toastActionHandlers = new Map<string, () => void>()

let toastCounter = 0

type ToastInput = {
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

function pushToastItem(input: ToastInput): string {
  const id = `toast-${++toastCounter}-${Date.now()}`
  const toast: ToastItem = {
    id,
    title: input.title,
    description: input.description,
    variant: input.variant ?? 'default',
    actionLabel: input.action?.label,
  }

  if (input.action) {
    toastActionHandlers.set(id, input.action.onClick)
  }

  store.dispatch(pushToast(toast))

  const duration = input.duration ?? (input.action ? 8000 : 3500)
  if (duration > 0) {
    window.setTimeout(() => dismissToast(id), duration)
  }

  return id
}

export function dismissToast(id: string) {
  toastActionHandlers.delete(id)
  store.dispatch(dismissToastAction(id))
}

export function runToastAction(id: string) {
  const handler = toastActionHandlers.get(id)
  dismissToast(id)
  handler?.()
}

export const toast = {
  show: (title: string, description?: string, options?: Omit<ToastInput, 'title' | 'description' | 'variant'>) =>
    pushToastItem({ title, description, ...options }),
  success: (
    title: string,
    description?: string,
    options?: Omit<ToastInput, 'title' | 'description' | 'variant'>,
  ) => pushToastItem({ title, description, variant: 'success', ...options }),
  error: (
    title: string,
    description?: string,
    options?: Omit<ToastInput, 'title' | 'description' | 'variant'>,
  ) => pushToastItem({ title, description, variant: 'error', ...options }),
  info: (
    title: string,
    description?: string,
    options?: Omit<ToastInput, 'title' | 'description' | 'variant'>,
  ) => pushToastItem({ title, description, variant: 'info', ...options }),
}

export function fileBasename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}
