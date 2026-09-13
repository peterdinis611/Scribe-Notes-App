import { store } from '@/store/index'
import { setMathDialog, type MathDialogMode } from '@/store/uiSlice'

export type MathDialogResult = {
  expression: string
  /** True when user cleared the expression (delete node on edit). */
  clear: boolean
}

export type MathDialogRequest = {
  mode: MathDialogMode
  /** insert | edit — edit allows clearing to delete */
  intent: 'insert' | 'edit'
  initialExpression?: string
}

let pendingResolve: ((value: MathDialogResult | null) => void) | null = null

export function resolveMathDialog(value: MathDialogResult | null) {
  pendingResolve?.(value)
  pendingResolve = null
  store.dispatch(setMathDialog({ open: false }))
}

/** Opens the math.js expression dialog. Resolves null if cancelled. */
export function promptMathExpressionDialog(
  request: MathDialogRequest,
): Promise<MathDialogResult | null> {
  return new Promise((resolve) => {
    if (pendingResolve) {
      pendingResolve(null)
    }
    pendingResolve = resolve
    store.dispatch(
      setMathDialog({
        open: true,
        mode: request.mode,
        intent: request.intent,
        initialExpression: request.initialExpression ?? '',
      }),
    )
  })
}
