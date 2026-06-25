import { atom, getDefaultStore } from 'jotai'

export type InputDialogOptions = {
  title: string
  description?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
}

export type InputDialogState =
  | ({ open: true } & InputDialogOptions)
  | { open: false }

export const inputDialogAtom = atom<InputDialogState>({ open: false })

let pendingResolve: ((value: string | null) => void) | null = null

export function resolveInputDialog(value: string | null) {
  pendingResolve?.(value)
  pendingResolve = null
  getDefaultStore().set(inputDialogAtom, { open: false })
}

export function promptInput(options: InputDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (pendingResolve) {
      pendingResolve(null)
    }
    pendingResolve = resolve
    getDefaultStore().set(inputDialogAtom, { open: true, ...options })
  })
}
