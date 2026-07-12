import { getStorageSettings, listDocuments, listFolders } from '@/lib/db/api'
import type { AppDispatch } from '@/store/index'
import {
  setActiveDocument,
  setActiveDocumentId,
  setDocuments,
  setSaveStatus,
} from '@/store/documentsSlice'
import { setFolders } from '@/store/foldersSlice'
import { persistStorageFolderAccessGranted } from '@/store/persistence'
import { setStorageSettings } from '@/store/settingsSlice'

export async function reloadLibraryFromBackend(dispatch: AppDispatch) {
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

  dispatch(setActiveDocumentId(null))
  dispatch(setActiveDocument(null))
  dispatch(setSaveStatus('saved'))
}
