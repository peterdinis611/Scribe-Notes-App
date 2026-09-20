import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ToastItem } from '@/lib/toast'

export type InputDialogOptions = {
  title: string
  description?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Mask input as a password field. */
  password?: boolean
}

export type InputDialogState = ({ open: true } & InputDialogOptions) | { open: false }

export type LoremDialogState = { open: boolean }

export type MathDialogMode = 'inline' | 'block'

export type MathDialogState =
  | { open: false }
  | {
      open: true
      mode: MathDialogMode
      intent: 'insert' | 'edit'
      initialExpression: string
    }

export type InvoiceDialogState = {
  open: boolean
  /** Partial invoice draft seed; shaped like InvoiceDialogDraft. */
  seed?: Record<string, unknown> | null
}

export type CommentDialogState =
  | { open: false }
  | {
      open: true
      quote?: string
      defaultAuthor: string
      defaultBody?: string
    }

export type CommentDialogResult = {
  author: string
  body: string
}

export type StorageAccessDialogIntent = 'info' | 'pick'

export type StorageAccessDialogState =
  | { open: false }
  | { open: true; intent: StorageAccessDialogIntent }

export interface UiState {
  toasts: ToastItem[]
  inputDialog: InputDialogState
  loremDialog: LoremDialogState
  mathDialog: MathDialogState
  invoiceDialog: InvoiceDialogState
  commentDialog: CommentDialogState
  storageAccessDialog: StorageAccessDialogState
  compileDialogOpen: boolean
  syncConflictsOpen: boolean
}

const initialState: UiState = {
  toasts: [],
  inputDialog: { open: false },
  loremDialog: { open: false },
  mathDialog: { open: false },
  invoiceDialog: { open: false },
  commentDialog: { open: false },
  storageAccessDialog: { open: false },
  compileDialogOpen: false,
  syncConflictsOpen: false,
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    pushToast(state, action: PayloadAction<ToastItem>) {
      state.toasts.push(action.payload)
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((item) => item.id !== action.payload)
    },
    setInputDialog(state, action: PayloadAction<InputDialogState>) {
      state.inputDialog = action.payload
    },
    setLoremDialog(state, action: PayloadAction<LoremDialogState>) {
      state.loremDialog = action.payload
    },
    setMathDialog(state, action: PayloadAction<MathDialogState>) {
      state.mathDialog = action.payload
    },
    setInvoiceDialog(state, action: PayloadAction<InvoiceDialogState>) {
      state.invoiceDialog = action.payload
    },
    setCommentDialog(state, action: PayloadAction<CommentDialogState>) {
      state.commentDialog = action.payload
    },
    setStorageAccessDialog(state, action: PayloadAction<StorageAccessDialogState>) {
      state.storageAccessDialog = action.payload
    },
    setCompileDialogOpen(state, action: PayloadAction<boolean>) {
      state.compileDialogOpen = action.payload
    },
    setSyncConflictsOpen(state, action: PayloadAction<boolean>) {
      state.syncConflictsOpen = action.payload
    },
  },
})

export const {
  pushToast,
  dismissToast,
  setInputDialog,
  setLoremDialog,
  setMathDialog,
  setInvoiceDialog,
  setCommentDialog,
  setStorageAccessDialog,
  setCompileDialogOpen,
  setSyncConflictsOpen,
} = uiSlice.actions

export default uiSlice.reducer
