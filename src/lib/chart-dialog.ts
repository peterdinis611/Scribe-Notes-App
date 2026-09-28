import { store } from '@/store/index'
import { setChartDialog } from '@/store/uiSlice'

export type ChartDialogResult = {
  source: string
  clear: boolean
}

export type ChartDialogRequest = {
  intent: 'insert' | 'edit'
  initialSource?: string
}

let pendingResolve: ((value: ChartDialogResult | null) => void) | null = null

export function resolveChartDialog(value: ChartDialogResult | null) {
  pendingResolve?.(value)
  pendingResolve = null
  store.dispatch(setChartDialog({ open: false }))
}

/** Opens the chart builder dialog. Resolves null if cancelled. */
export function promptChartDialog(request: ChartDialogRequest): Promise<ChartDialogResult | null> {
  return new Promise((resolve) => {
    if (pendingResolve) pendingResolve(null)
    pendingResolve = resolve
    store.dispatch(
      setChartDialog({
        open: true,
        intent: request.intent,
        initialSource: request.initialSource ?? '',
      }),
    )
  })
}
