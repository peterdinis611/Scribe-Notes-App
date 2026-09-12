import { store } from '@/store/index'
import { setLoremDialog } from '@/store/uiSlice'
import type { LoremOptions } from '@/lib/editor/lorem-ipsum'

let pendingResolve: ((value: LoremOptions | null) => void) | null = null

export function resolveLoremDialog(value: LoremOptions | null) {
  pendingResolve?.(value)
  pendingResolve = null
  store.dispatch(setLoremDialog({ open: false }))
}

/** Opens the Lorem ipsum options dialog. Resolves with chosen options, or null if cancelled. */
export function promptLoremOptions(): Promise<LoremOptions | null> {
  return new Promise((resolve) => {
    if (pendingResolve) {
      pendingResolve(null)
    }
    pendingResolve = resolve
    store.dispatch(setLoremDialog({ open: true }))
  })
}
