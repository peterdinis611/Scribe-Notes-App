import { store } from '@/store/index'
import { setAiResultDialog, type AiResultDialogState } from '@/store/uiSlice'

export type AiResultDialogChoice = 'apply' | 'discard' | 'cancel'

export type OpenAiResultDialogOptions = {
  title: string
  loading?: boolean
  result?: string
  onCancel?: () => void
}

let pendingResolve: ((value: AiResultDialogChoice) => void) | null = null

export function resolveAiResultDialog(choice: AiResultDialogChoice) {
  pendingResolve?.(choice)
  pendingResolve = null
  store.dispatch(setAiResultDialog({ open: false }))
}

export function updateAiResultDialog(patch: Partial<Extract<AiResultDialogState, { open: true }>>) {
  const current = store.getState().ui.aiResultDialog
  if (!current.open) return
  store.dispatch(setAiResultDialog({ ...current, ...patch }))
}

export function openAiResultDialog(options: OpenAiResultDialogOptions): Promise<AiResultDialogChoice> {
  return new Promise((resolve) => {
    if (pendingResolve) {
      pendingResolve('cancel')
    }
    pendingResolve = resolve
    store.dispatch(
      setAiResultDialog({
        open: true,
        title: options.title,
        loading: options.loading ?? true,
        result: options.result ?? '',
        onCancel: options.onCancel ?? null,
      }),
    )
  })
}
