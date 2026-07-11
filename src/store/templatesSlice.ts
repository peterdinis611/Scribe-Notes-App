import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { JSONContent } from '@tiptap/core'

export type SaveCustomTemplateDialogState =
  | { open: false }
  | {
      open: true
      content: JSONContent
      suggestedName?: string
      suggestedTitle?: string
    }

export interface TemplatesState {
  saveCustomTemplateDialog: SaveCustomTemplateDialogState
}

const initialState: TemplatesState = {
  saveCustomTemplateDialog: { open: false },
}

const templatesSlice = createSlice({
  name: 'templates',
  initialState,
  reducers: {
    setSaveCustomTemplateDialog(state, action: PayloadAction<SaveCustomTemplateDialogState>) {
      state.saveCustomTemplateDialog = action.payload
    },
  },
})

export const { setSaveCustomTemplateDialog } = templatesSlice.actions

export default templatesSlice.reducer
