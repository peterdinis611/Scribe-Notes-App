export type ConfirmDialogOptions = {
  title: string
  description: string
  okLabel?: string
  cancelLabel?: string
  /** When true, the confirm action uses the destructive button style. */
  destructive?: boolean
}

export type ConfirmDialogState = ConfirmDialogOptions & { open: true } | { open: false }

type Listener = () => void

let state: ConfirmDialogState = { open: false }
let pendingResolve: ((value: boolean) => void) | null = null
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener()
}

export function getConfirmDialogState() {
  return state
}

export function subscribeConfirmDialog(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resolveConfirmDialog(value: boolean) {
  pendingResolve?.(value)
  pendingResolve = null
  state = { open: false }
  emit()
}

export function requestConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (pendingResolve) {
      pendingResolve(false)
    }
    pendingResolve = resolve
    state = { open: true, ...options }
    emit()
  })
}
