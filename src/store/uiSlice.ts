import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type InputDialogOptions = {
  title: string
  description?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Mask input as a password field. */
  password?: boolean
  /** Use a multiline textarea (e.g. custom block body). */
  multiline?: boolean
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

export type ChartDialogState =
  | { open: false }
  | {
      open: true
      intent: 'insert' | 'edit'
      initialSource: string
    }

export type MermaidDialogState =
  | { open: false }
  | {
      open: true
      intent: 'insert' | 'edit'
      initialSource: string
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
  inputDialog: InputDialogState
  loremDialog: LoremDialogState
  mathDialog: MathDialogState
  chartDialog: ChartDialogState
  mermaidDialog: MermaidDialogState
  invoiceDialog: InvoiceDialogState
  commentDialog: CommentDialogState
  storageAccessDialog: StorageAccessDialogState
  compileDialogOpen: boolean
  syncConflictsOpen: boolean
}

const initialState: UiState = {
  inputDialog: { open: false },
  loremDialog: { open: false },
  mathDialog: { open: false },
  chartDialog: { open: false },
  mermaidDialog: { open: false },
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
    setInputDialog(state, action: PayloadAction<InputDialogState>) {
      state.inputDialog = action.payload
    },
    setLoremDialog(state, action: PayloadAction<LoremDialogState>) {
      state.loremDialog = action.payload
    },
    setMathDialog(state, action: PayloadAction<MathDialogState>) {
      state.mathDialog = action.payload
    },
    setChartDialog(state, action: PayloadAction<ChartDialogState>) {
      state.chartDialog = action.payload
    },
    setMermaidDialog(state, action: PayloadAction<MermaidDialogState>) {
      state.mermaidDialog = action.payload
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
  setInputDialog,
  setLoremDialog,
  setMathDialog,
  setChartDialog,
  setMermaidDialog,
  setInvoiceDialog,
  setCommentDialog,
  setStorageAccessDialog,
  setCompileDialogOpen,
  setSyncConflictsOpen,
} = uiSlice.actions

export default uiSlice.reducer
