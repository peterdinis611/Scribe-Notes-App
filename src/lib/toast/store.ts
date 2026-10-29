import {
  applyToastStack,
  DEFAULT_TOAST_SETTINGS,
  type ToastSettings,
  type ToastStackItem,
} from '@/lib/toast/settings'
import type { ToastItem, ToastState } from '@/lib/toast/types'

export const TOAST_EXIT_EVENT = 'scribe:toast-exit'

type Listener = () => void

let state: ToastState = { items: [] }
let settings: ToastSettings = { ...DEFAULT_TOAST_SETTINGS }
const listeners = new Set<Listener>()
const actionHandlers = new Map<string, () => void>()
const pendingExit = new Set<string>()
let toastCounter = 0

function emit() {
  for (const listener of listeners) listener()
}

export function getToastState(): ToastState {
  return state
}

export function getToastSettings(): ToastSettings {
  return settings
}

export function applyToastSettings(next: ToastSettings): void {
  settings = next
  emit()
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function nextToastId(): string {
  toastCounter += 1
  return `toast-${toastCounter}-${Date.now()}`
}

export function pushToastItem(item: ToastItem, action?: () => void): void {
  if (action) actionHandlers.set(item.id, action)
  const incoming: ToastStackItem = {
    id: item.id,
    title: item.title,
    description: item.description,
    variant: item.variant,
    actionLabel: item.actionLabel,
  }
  const stacked = applyToastStack(state.items, incoming, settings)
  // Drop handlers for removed ids
  const alive = new Set(stacked.map((t) => t.id))
  for (const id of actionHandlers.keys()) {
    if (!alive.has(id)) actionHandlers.delete(id)
  }
  state = { items: stacked as ToastItem[] }
  emit()
}

export function beginToastExit(id: string): boolean {
  if (pendingExit.has(id)) return false
  if (!state.items.some((item) => item.id === id)) return false
  pendingExit.add(id)
  window.dispatchEvent(new CustomEvent(TOAST_EXIT_EVENT, { detail: { id } }))
  return true
}

export function removeToastItem(id: string): void {
  pendingExit.delete(id)
  actionHandlers.delete(id)
  const next = state.items.filter((item) => item.id !== id)
  if (next.length === state.items.length) return
  state = { items: next }
  emit()
}

export function takeToastAction(id: string): (() => void) | undefined {
  const handler = actionHandlers.get(id)
  actionHandlers.delete(id)
  return handler
}

export function getToastExitMs(): number {
  return settings.exitMs
}

/** Test helper — clear all toasts and handlers. */
export function resetToastStore(): void {
  state = { items: [] }
  actionHandlers.clear()
  pendingExit.clear()
  emit()
}
