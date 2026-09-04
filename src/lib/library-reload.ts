import { fetchDocumentFresh, getStorageSettings, listDocuments, listFolders } from '@/lib/db/api'
import { invalidateDocumentCache } from '@/lib/cache/document-cache'
import type { AppDispatch, RootState } from '@/store/index'
import {
  setActiveDocument,
  setActiveDocumentId,
  setDocuments,
  setSaveStatus,
} from '@/store/documentsSlice'
import { setFolders } from '@/store/foldersSlice'
import { persistStorageFolderAccessGranted } from '@/store/persistence'
import { setStorageSettings } from '@/store/settingsSlice'

export async function reloadLibraryFromBackend(
  dispatch: AppDispatch,
  options?: {
    preserveActive?: boolean
    /** When true, refresh the open document from SQLite if it is not dirty. */
    refreshActive?: boolean
    getState?: () => RootState
  },
) {
  const [docs, folders, settings] = await Promise.all([
    listDocuments(),
    listFolders(),
    getStorageSettings(),
  ])

  dispatch(setDocuments(docs))
  dispatch(setFolders(folders))
  dispatch(setStorageSettings(settings))

  if (settings.folderAccessGranted) {
    persistStorageFolderAccessGranted(true)
  }

  if (!options?.preserveActive) {
    dispatch(setActiveDocumentId(null))
    dispatch(setActiveDocument(null))
    dispatch(setSaveStatus('saved'))
    return
  }

  if (!options.refreshActive || !options.getState) return

  const { activeDocumentId, saveStatus } = options.getState().documents
  if (!activeDocumentId || saveStatus === 'dirty' || saveStatus === 'saving') return

  invalidateDocumentCache(activeDocumentId)
  try {
    const doc = await fetchDocumentFresh(activeDocumentId)
    dispatch(setActiveDocument(doc))
    dispatch(setSaveStatus('saved'))
  } catch {
    // Keep the current editor buffer if refresh fails.
  }
}
