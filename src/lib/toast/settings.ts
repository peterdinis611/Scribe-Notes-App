/**
 * Toast preferences — keep in sync with `crates/scribe-toast`.
 */

export type ToastPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
export type ToastStackBehavior = 'drop-oldest' | 'drop-newest' | 'replace-same'

export type ToastSettings = {
  enabled: boolean
  position: ToastPosition
  durationMs: number
  durationWithActionMs: number
  exitMs: number
  maxVisible: number
  stackBehavior: ToastStackBehavior
  pauseOnHover: boolean
  showSuccess: boolean
  showError: boolean
  showInfo: boolean
  showDefault: boolean
  respectReducedMotion: boolean
  dense: boolean
}

export const DEFAULT_TOAST_SETTINGS: ToastSettings = {
  enabled: true,
  position: 'bottom-right',
  durationMs: 3500,
  durationWithActionMs: 8000,
  exitMs: 200,
  maxVisible: 5,
  stackBehavior: 'drop-oldest',
  pauseOnHover: true,
  showSuccess: true,
  showError: true,
  showInfo: true,
  showDefault: true,
  respectReducedMotion: true,
  dense: false,
}

const DURATION_MIN = 800
const DURATION_MAX = 30_000
const EXIT_MAX = 1000
const MAX_VISIBLE_MIN = 1
const MAX_VISIBLE_MAX = 12

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function normalizeToastSettings(input: Partial<ToastSettings> | null | undefined): ToastSettings {
  const base = { ...DEFAULT_TOAST_SETTINGS, ...(input ?? {}) }
  let durationMs = clamp(base.durationMs, DURATION_MIN, DURATION_MAX)
  let durationWithActionMs = clamp(base.durationWithActionMs, DURATION_MIN, DURATION_MAX)
  if (durationWithActionMs < durationMs) durationWithActionMs = durationMs
  const position: ToastPosition = (
    ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const
  ).includes(base.position as ToastPosition)
    ? (base.position as ToastPosition)
    : 'bottom-right'
  const stackBehavior: ToastStackBehavior = (
    ['drop-oldest', 'drop-newest', 'replace-same'] as const
  ).includes(base.stackBehavior as ToastStackBehavior)
    ? (base.stackBehavior as ToastStackBehavior)
    : 'drop-oldest'

  return {
    enabled: Boolean(base.enabled),
    position,
    durationMs,
    durationWithActionMs,
    exitMs: clamp(base.exitMs, 0, EXIT_MAX),
    maxVisible: clamp(base.maxVisible, MAX_VISIBLE_MIN, MAX_VISIBLE_MAX),
    stackBehavior,
    pauseOnHover: Boolean(base.pauseOnHover),
    showSuccess: Boolean(base.showSuccess),
    showError: Boolean(base.showError),
    showInfo: Boolean(base.showInfo),
    showDefault: Boolean(base.showDefault),
    respectReducedMotion: Boolean(base.respectReducedMotion),
    dense: Boolean(base.dense),
  }
}

export function resolveToastDuration(
  settings: ToastSettings,
  hasAction: boolean,
  overrideMs?: number,
): number {
  if (overrideMs != null && Number.isFinite(overrideMs)) return Math.max(0, Math.round(overrideMs))
  return hasAction ? settings.durationWithActionMs : settings.durationMs
}

export function shouldShowToastVariant(
  settings: ToastSettings,
  variant: 'default' | 'success' | 'error' | 'info',
): boolean {
  if (!settings.enabled) return false
  if (variant === 'success') return settings.showSuccess
  if (variant === 'error') return settings.showError
  if (variant === 'info') return settings.showInfo
  return settings.showDefault
}

export function toastPositionClass(settings: ToastSettings): string {
  return `toast-host--${settings.position}`
}

export type ToastStackItem = {
  id: string
  title: string
  description?: string
  variant: 'default' | 'success' | 'error' | 'info'
  actionLabel?: string
}

export function applyToastStack(
  existing: ToastStackItem[],
  incoming: ToastStackItem,
  settings: ToastSettings,
): ToastStackItem[] {
  const max = Math.max(1, settings.maxVisible)
  if (settings.stackBehavior === 'replace-same') {
    const idx = existing.findIndex((item) => item.title === incoming.title)
    if (idx >= 0) {
      const next = existing.slice()
      next[idx] = incoming
      return next
    }
    const next = [...existing, incoming]
    while (next.length > max) next.shift()
    return next
  }
  if (settings.stackBehavior === 'drop-newest') {
    if (existing.length >= max) return existing
    return [...existing, incoming]
  }
  const next = [...existing, incoming]
  while (next.length > max) next.shift()
  return next
}
