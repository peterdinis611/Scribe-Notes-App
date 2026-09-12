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

export type LoremDialogState = { open: boolean }

export type StorageAccessDialogIntent = 'info' | 'pick'

export type StorageAccessDialogState =
  | { open: false }
  | { open: true; intent: StorageAccessDialogIntent }

export interface UiState {
  toasts: ToastItem[]
  inputDialog: InputDialogState
  loremDialog: LoremDialogState
  storageAccessDialog: StorageAccessDialogState
}

const initialState: UiState = {
  toasts: [],
  inputDialog: { open: false },
  loremDialog: { open: false },
  storageAccessDialog: { open: false },
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
    setStorageAccessDialog(state, action: PayloadAction<StorageAccessDialogState>) {
      state.storageAccessDialog = action.payload
    },
  },
})

export const {
  pushToast,
  dismissToast,
  setInputDialog,
  setLoremDialog,
  setStorageAccessDialog,
} = uiSlice.actions

export default uiSlice.reducer
