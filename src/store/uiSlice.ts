import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ToastItem } from '@/lib/toast'

export type InputDialogOptions = {
  title: string
  description?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
}

export type InputDialogState = ({ open: true } & InputDialogOptions) | { open: false }

export type StorageAccessDialogIntent = 'info' | 'pick'

export type StorageAccessDialogState =
  | { open: false }
  | { open: true; intent: StorageAccessDialogIntent }

export type AiResultDialogState =
  | { open: false }
  | {
      open: true
      title: string
      loading: boolean
      result: string
      onCancel: (() => void) | null
    }

export interface UiState {
  toasts: ToastItem[]
  inputDialog: InputDialogState
  storageAccessDialog: StorageAccessDialogState
  aiResultDialog: AiResultDialogState
}

const initialState: UiState = {
  toasts: [],
  inputDialog: { open: false },
  storageAccessDialog: { open: false },
  aiResultDialog: { open: false },
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
    setStorageAccessDialog(state, action: PayloadAction<StorageAccessDialogState>) {
      state.storageAccessDialog = action.payload
    },
    setAiResultDialog(state, action: PayloadAction<AiResultDialogState>) {
      state.aiResultDialog = action.payload
    },
  },
})

export const {
  pushToast,
  dismissToast,
  setInputDialog,
  setStorageAccessDialog,
  setAiResultDialog,
} = uiSlice.actions

export default uiSlice.reducer
