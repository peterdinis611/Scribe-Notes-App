import { store } from '@/store/index'
import {
  setCommentDialog,
  type CommentDialogResult,
  type CommentDialogState,
} from '@/store/uiSlice'

let pendingResolve: ((value: CommentDialogResult | null) => void) | null = null

export function resolveCommentDialog(value: CommentDialogResult | null) {
  pendingResolve?.(value)
  pendingResolve = null
  store.dispatch(setCommentDialog({ open: false }))
}

export function promptComment(
  options: Extract<CommentDialogState, { open: true }>,
): Promise<CommentDialogResult | null> {
  return new Promise((resolve) => {
    if (pendingResolve) {
      pendingResolve(null)
    }
    pendingResolve = resolve
    store.dispatch(setCommentDialog(options))
  })
}
