import { store } from '@/store/index'
import { setInputDialog, type InputDialogOptions, type InputDialogState } from '@/store/uiSlice'

export type { InputDialogOptions, InputDialogState }

let pendingResolve: ((value: string | null) => void) | null = null

export function resolveInputDialog(value: string | null) {
  pendingResolve?.(value)
  pendingResolve = null
  store.dispatch(setInputDialog({ open: false }))
}

export function promptInput(options: InputDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (pendingResolve) {
      pendingResolve(null)
    }
    pendingResolve = resolve
    store.dispatch(setInputDialog({ open: true, ...options }))
  })
}
