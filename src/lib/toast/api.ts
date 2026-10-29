import {
  beginToastExit,
  getToastExitMs,
  getToastSettings,
  nextToastId,
  pushToastItem,
  removeToastItem,
  takeToastAction,
} from '@/lib/toast/store'
import {
  resolveToastDuration,
  shouldShowToastVariant,
} from '@/lib/toast/settings'
import type { ToastInput, ToastItem } from '@/lib/toast/types'

function pushToast(input: ToastInput): string {
  const settings = getToastSettings()
  const variant = input.variant ?? 'default'
  if (!shouldShowToastVariant(settings, variant)) {
    return ''
  }

  const id = nextToastId()
  const item: ToastItem = {
    id,
    title: input.title,
    description: input.description,
    variant,
    actionLabel: input.action?.label,
  }

  pushToastItem(item, input.action?.onClick)

  const duration = resolveToastDuration(settings, Boolean(input.action), input.duration)
  if (duration > 0) {
    window.setTimeout(() => dismissToast(id), duration)
  }

  return id
}

export function dismissToast(id: string): void {
  if (!id) return
  if (!beginToastExit(id)) return
  window.setTimeout(() => {
    removeToastItem(id)
  }, getToastExitMs())
}

export function runToastAction(id: string): void {
  const handler = takeToastAction(id)
  dismissToast(id)
  handler?.()
}

export const toast = {
  show: (
    title: string,
    description?: string,
    options?: Omit<ToastInput, 'title' | 'description' | 'variant'>,
  ) => pushToast({ title, description, ...options }),
  success: (
    title: string,
    description?: string,
    options?: Omit<ToastInput, 'title' | 'description' | 'variant'>,
  ) => pushToast({ title, description, variant: 'success', ...options }),
  error: (
    title: string,
    description?: string,
    options?: Omit<ToastInput, 'title' | 'description' | 'variant'>,
  ) => pushToast({ title, description, variant: 'error', ...options }),
  info: (
    title: string,
    description?: string,
    options?: Omit<ToastInput, 'title' | 'description' | 'variant'>,
  ) => pushToast({ title, description, variant: 'info', ...options }),
}

export function fileBasename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}
