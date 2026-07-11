import { configureStore } from '@reduxjs/toolkit'
import documentsReducer from '@/store/documentsSlice'
import foldersReducer from '@/store/foldersSlice'
import settingsReducer from '@/store/settingsSlice'
import templatesReducer from '@/store/templatesSlice'
import uiReducer from '@/store/uiSlice'

export const store = configureStore({
  reducer: {
    documents: documentsReducer,
    folders: foldersReducer,
    settings: settingsReducer,
    templates: templatesReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['templates/setSaveCustomTemplateDialog'],
        ignoredPaths: ['templates.saveCustomTemplateDialog.content'],
      },
    }),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
