import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Document, DocumentSummary } from '@/lib/db/api'
import {
  persistBoolStorage,
  persistCommentAuthor,
  persistManualTitleIds,
  persistActiveDocumentId,
  readActiveDocumentId,
  readBoolStorage,
  readCommentAuthor,
  readManualTitleIds,
} from '@/store/persistence'

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export interface DocumentsState {
  documents: DocumentSummary[]
  activeDocumentId: string | null
  activeDocument: Document | null
  saveStatus: SaveStatus
  sidebarOpen: boolean
  documentOutlineOpen: boolean
  revisionHistoryOpen: boolean
  commentsPanelOpen: boolean
  statsPanelOpen: boolean
  backlinksPanelOpen: boolean
  focusMode: boolean
  readingMode: boolean
  manualTitleDocumentIds: string[]
  findReplaceOpen: boolean
  findReplaceMode: 'find' | 'replace'
  trashOpen: boolean
  favoritesOnlyFilter: boolean
  activeTagFilter: string | null
  commentsVersion: number
  commentAuthor: string
  diskSyncWarning: string | null
}

const initialState: DocumentsState = {
  documents: [],
  activeDocumentId: readActiveDocumentId(),
  activeDocument: null,
  saveStatus: 'idle',
  sidebarOpen: true,
  documentOutlineOpen: readBoolStorage('scribe-document-outline-open', false),
  revisionHistoryOpen: readBoolStorage('scribe-revision-history-open', false),
  commentsPanelOpen: readBoolStorage('scribe-comments-open', false),
  statsPanelOpen: readBoolStorage('scribe-stats-open', false),
  backlinksPanelOpen: readBoolStorage('scribe-backlinks-open', false),
  focusMode: readBoolStorage('scribe-focus-mode', false),
  readingMode: readBoolStorage('scribe-reading-mode', false),
  manualTitleDocumentIds: readManualTitleIds(),
  findReplaceOpen: false,
  findReplaceMode: 'find',
  trashOpen: false,
  favoritesOnlyFilter: false,
  activeTagFilter: null,
  commentsVersion: 0,
  commentAuthor: readCommentAuthor(),
  diskSyncWarning: null,
}

const documentsSlice = createSlice({
  name: 'documents',
  initialState,
  reducers: {
    setDocuments(state, action: PayloadAction<DocumentSummary[]>) {
      state.documents = action.payload
    },
    updateDocuments(state, action: PayloadAction<(prev: DocumentSummary[]) => DocumentSummary[]>) {
      state.documents = action.payload(state.documents)
    },
    setActiveDocumentId(state, action: PayloadAction<string | null>) {
      state.activeDocumentId = action.payload
      persistActiveDocumentId(action.payload)
    },
    setActiveDocument(state, action: PayloadAction<Document | null>) {
      state.activeDocument = action.payload
    },
    setSaveStatus(state, action: PayloadAction<SaveStatus>) {
      state.saveStatus = action.payload
    },
    setSidebarOpen(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload
    },
    setDocumentOutlineOpen(state, action: PayloadAction<boolean>) {
      state.documentOutlineOpen = action.payload
      persistBoolStorage('scribe-document-outline-open', action.payload)
    },
    setRevisionHistoryOpen(state, action: PayloadAction<boolean>) {
      state.revisionHistoryOpen = action.payload
      persistBoolStorage('scribe-revision-history-open', action.payload)
    },
    setCommentsPanelOpen(state, action: PayloadAction<boolean>) {
      state.commentsPanelOpen = action.payload
      persistBoolStorage('scribe-comments-open', action.payload)
    },
    setStatsPanelOpen(state, action: PayloadAction<boolean>) {
      state.statsPanelOpen = action.payload
      persistBoolStorage('scribe-stats-open', action.payload)
    },
    setBacklinksPanelOpen(state, action: PayloadAction<boolean>) {
      state.backlinksPanelOpen = action.payload
      persistBoolStorage('scribe-backlinks-open', action.payload)
    },
    setFocusMode(state, action: PayloadAction<boolean>) {
      state.focusMode = action.payload
      persistBoolStorage('scribe-focus-mode', action.payload)
    },
    toggleFocusMode(state) {
      state.focusMode = !state.focusMode
      persistBoolStorage('scribe-focus-mode', state.focusMode)
      if (state.focusMode) {
        state.readingMode = false
        persistBoolStorage('scribe-reading-mode', false)
      }
    },
    setReadingMode(state, action: PayloadAction<boolean>) {
      state.readingMode = action.payload
      persistBoolStorage('scribe-reading-mode', action.payload)
      if (action.payload) {
        state.focusMode = false
        persistBoolStorage('scribe-focus-mode', false)
      }
    },
    toggleReadingMode(state) {
      state.readingMode = !state.readingMode
      persistBoolStorage('scribe-reading-mode', state.readingMode)
      if (state.readingMode) {
        state.focusMode = false
        persistBoolStorage('scribe-focus-mode', false)
      }
    },
    setManualTitleDocumentIds(state, action: PayloadAction<string[]>) {
      state.manualTitleDocumentIds = action.payload
      persistManualTitleIds(action.payload)
    },
    markDocumentTitleManual(state, action: PayloadAction<string>) {
      if (!state.manualTitleDocumentIds.includes(action.payload)) {
        state.manualTitleDocumentIds.push(action.payload)
        persistManualTitleIds(state.manualTitleDocumentIds)
      }
    },
    setFindReplaceOpen(state, action: PayloadAction<boolean>) {
      state.findReplaceOpen = action.payload
    },
    toggleFindReplaceOpen(state) {
      state.findReplaceOpen = !state.findReplaceOpen
    },
    setFindReplaceMode(state, action: PayloadAction<'find' | 'replace'>) {
      state.findReplaceMode = action.payload
    },
    setTrashOpen(state, action: PayloadAction<boolean>) {
      state.trashOpen = action.payload
    },
    setFavoritesOnlyFilter(state, action: PayloadAction<boolean>) {
      state.favoritesOnlyFilter = action.payload
    },
    toggleFavoritesOnlyFilter(state) {
      state.favoritesOnlyFilter = !state.favoritesOnlyFilter
    },
    setActiveTagFilter(state, action: PayloadAction<string | null>) {
      state.activeTagFilter = action.payload
    },
    bumpCommentsVersion(state) {
      state.commentsVersion += 1
    },
    setCommentAuthor(state, action: PayloadAction<string>) {
      const trimmed = action.payload.trim() || 'Ja'
      state.commentAuthor = trimmed
      persistCommentAuthor(trimmed)
    },
    setDiskSyncWarning(state, action: PayloadAction<string | null>) {
      state.diskSyncWarning = action.payload
    },
  },
})

export const {
  setDocuments,
  updateDocuments,
  setActiveDocumentId,
  setActiveDocument,
  setSaveStatus,
  setSidebarOpen,
  setDocumentOutlineOpen,
  setRevisionHistoryOpen,
  setCommentsPanelOpen,
  setStatsPanelOpen,
  setBacklinksPanelOpen,
  setFocusMode,
  toggleFocusMode,
  setReadingMode,
  toggleReadingMode,
  setManualTitleDocumentIds,
  markDocumentTitleManual,
  setFindReplaceOpen,
  toggleFindReplaceOpen,
  setFindReplaceMode,
  setTrashOpen,
  setFavoritesOnlyFilter,
  toggleFavoritesOnlyFilter,
  setActiveTagFilter,
  bumpCommentsVersion,
  setCommentAuthor,
  setDiskSyncWarning,
} = documentsSlice.actions

export default documentsSlice.reducer
