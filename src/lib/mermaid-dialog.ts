import { store } from '@/store/index'
import { setMermaidDialog } from '@/store/uiSlice'

export type MermaidDialogResult = {
  source: string
  clear: boolean
}

export type MermaidDialogRequest = {
  intent: 'insert' | 'edit'
  initialSource?: string
}

let pendingResolve: ((value: MermaidDialogResult | null) => void) | null = null

export function resolveMermaidDialog(value: MermaidDialogResult | null) {
  pendingResolve?.(value)
  pendingResolve = null
  store.dispatch(setMermaidDialog({ open: false }))
}

/** Opens the Mermaid template dialog. Resolves null if cancelled. */
export function promptMermaidDialog(
  request: MermaidDialogRequest,
): Promise<MermaidDialogResult | null> {
  return new Promise((resolve) => {
    if (pendingResolve) pendingResolve(null)
    pendingResolve = resolve
    store.dispatch(
      setMermaidDialog({
        open: true,
        intent: request.intent,
        initialSource: request.initialSource ?? '',
      }),
    )
  })
}
