/**
 * Scribe toast library — self-contained notifications (no Redux).
 * Preferences / stacking logic mirror `crates/scribe-toast`.
 *
 * Usage:
 *   import { toast, ToastHost } from '@/lib/toast'
 *   toast.success('Saved')
 *   <ToastHost />
 */

export { toast, dismissToast, runToastAction, fileBasename } from '@/lib/toast/api'
export { ToastHost } from '@/lib/toast/host'
export {
  applyToastSettings,
  getToastSettings,
  getToastState,
  resetToastStore,
  subscribeToasts,
  TOAST_EXIT_EVENT,
} from '@/lib/toast/store'
export {
  applyToastStack,
  DEFAULT_TOAST_SETTINGS,
  normalizeToastSettings,
  resolveToastDuration,
  shouldShowToastVariant,
  toastPositionClass,
  type ToastPosition,
  type ToastSettings,
  type ToastStackBehavior,
  type ToastStackItem,
} from '@/lib/toast/settings'
export type { ToastInput, ToastItem, ToastState, ToastVariant } from '@/lib/toast/types'
