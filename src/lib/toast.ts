import { atom, getDefaultStore } from 'jotai'

export type ToastVariant = 'default' | 'success' | 'error' | 'info'

export type ToastItem = {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

export const toastsAtom = atom<ToastItem[]>([])

let toastCounter = 0

type ToastInput = {
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

function pushToast(input: ToastInput): string {
  const id = `toast-${++toastCounter}-${Date.now()}`
  const toast: ToastItem = {
    id,
    title: input.title,
    description: input.description,
    variant: input.variant ?? 'default',
  }

  const store = getDefaultStore()
  store.set(toastsAtom, (current) => [...current, toast])

  const duration = input.duration ?? 3500
  if (duration > 0) {
    window.setTimeout(() => dismissToast(id), duration)
  }

  return id
}

export function dismissToast(id: string) {
  getDefaultStore().set(toastsAtom, (current) => current.filter((item) => item.id !== id))
}

export const toast = {
  show: (title: string, description?: string) => pushToast({ title, description }),
  success: (title: string, description?: string) =>
    pushToast({ title, description, variant: 'success' }),
  error: (title: string, description?: string) => pushToast({ title, description, variant: 'error' }),
  info: (title: string, description?: string) => pushToast({ title, description, variant: 'info' }),
}

export function fileBasename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}
