import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { JSONContent } from '@tiptap/core'
import { createCustomTemplate, type CustomDocumentTemplate, type CustomTemplateInput } from '@/lib/templates/custom'
import { persistCustomTemplates, readCustomTemplates } from '@/store/persistence'

export type SaveCustomTemplateDialogState =
  | { open: false }
  | {
      open: true
      content: JSONContent
      suggestedName?: string
      suggestedTitle?: string
    }

export interface TemplatesState {
  customTemplates: CustomDocumentTemplate[]
  saveCustomTemplateDialog: SaveCustomTemplateDialogState
}

const initialState: TemplatesState = {
  customTemplates: readCustomTemplates(),
  saveCustomTemplateDialog: { open: false },
}

const templatesSlice = createSlice({
  name: 'templates',
  initialState,
  reducers: {
    setCustomTemplates(state, action: PayloadAction<CustomDocumentTemplate[]>) {
      state.customTemplates = action.payload
      persistCustomTemplates(action.payload)
    },
    addCustomTemplate(state, action: PayloadAction<CustomTemplateInput>) {
      const next = createCustomTemplate(action.payload)
      state.customTemplates.push(next)
      persistCustomTemplates(state.customTemplates)
    },
    removeCustomTemplate(state, action: PayloadAction<string>) {
      state.customTemplates = state.customTemplates.filter((template) => template.id !== action.payload)
      persistCustomTemplates(state.customTemplates)
    },
    setSaveCustomTemplateDialog(state, action: PayloadAction<SaveCustomTemplateDialogState>) {
      state.saveCustomTemplateDialog = action.payload
    },
  },
})

export const {
  setCustomTemplates,
  addCustomTemplate,
  removeCustomTemplate,
  setSaveCustomTemplateDialog,
} = templatesSlice.actions

export default templatesSlice.reducer
