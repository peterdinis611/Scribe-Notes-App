import { restoreLibrarySession } from '@/store/documentsSlice'
import type { AppDispatch } from '@/store/index'
import {
  readLibrarySession,
  setPersistLibraryId,
  type LibrarySessionSnapshot,
} from '@/store/persistence'

const EMPTY_SESSION: LibrarySessionSnapshot = {
  openDocumentIds: [],
  pinnedDocumentIds: [],
  recentDocumentIds: [],
  recentlyClosedIds: [],
  activeDocumentId: null,
}

export function bindPersistLibrary(id: string | null | undefined) {
  setPersistLibraryId(id)
}

export function clearLibrarySession(dispatch: AppDispatch) {
  dispatch(restoreLibrarySession(EMPTY_SESSION))
}

export function loadLibrarySession(dispatch: AppDispatch, libraryId: string | null | undefined) {
  setPersistLibraryId(libraryId)
  dispatch(restoreLibrarySession(readLibrarySession()))
}
