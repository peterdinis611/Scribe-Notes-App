import { store } from '@/store/index'
import { dismissToast as dismissToastAction, pushToast } from '@/store/uiSlice'

export type ToastVariant = 'default' | 'success' | 'error' | 'info'

export type ToastItem = {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

let toastCounter = 0

type ToastInput = {
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

function pushToastItem(input: ToastInput): string {
  const id = `toast-${++toastCounter}-${Date.now()}`
  const toast: ToastItem = {
    id,
    title: input.title,
    description: input.description,
    variant: input.variant ?? 'default',
  }

  store.dispatch(pushToast(toast))

  const duration = input.duration ?? 3500
  if (duration > 0) {
    window.setTimeout(() => dismissToast(id), duration)
  }

  return id
}

export function dismissToast(id: string) {
  store.dispatch(dismissToastAction(id))
}

export const toast = {
  show: (title: string, description?: string) => pushToastItem({ title, description }),
  success: (title: string, description?: string) =>
    pushToastItem({ title, description, variant: 'success' }),
  error: (title: string, description?: string) =>
    pushToastItem({ title, description, variant: 'error' }),
  info: (title: string, description?: string) => pushToastItem({ title, description, variant: 'info' }),
}

export function fileBasename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}
