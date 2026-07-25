import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Document, DocumentSummary } from '@/lib/db/api'
import {
  persistBoolStorage,
  persistCommentAuthor,
  persistManualTitleIds,
  persistActiveDocumentId,
  persistOpenDocumentIds,
  persistRecentDocumentIds,
  persistRecentlyClosedIds,
  pushRecentId,
  readActiveDocumentId,
  readBoolStorage,
  readCommentAuthor,
  readManualTitleIds,
  readOpenDocumentIds,
  readRecentDocumentIds,
  readRecentlyClosedIds,
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
  pendingEditorSearch: string | null
  trashOpen: boolean
  favoritesOnlyFilter: boolean
  activeTagFilter: string | null
  commentsVersion: number
  commentAuthor: string
  diskSyncWarning: string | null
  /** Most-recently activated document ids (newest first). */
  recentDocumentIds: string[]
  /** Documents left when switching away (newest first). */
  recentlyClosedIds: string[]
  /** Open editor tabs (left-to-right order). */
  openDocumentIds: string[]
  /** Document shown in the right split pane (null = no split). */
  secondaryDocumentId: string | null
}

function pruneIds(ids: string[], documents: DocumentSummary[]): string[] {
  const alive = new Set(
    documents.filter((doc) => doc.deletedAt == null).map((doc) => doc.id),
  )
  return ids.filter((id) => alive.has(id))
}

const initialRecent = readRecentDocumentIds()
const initialClosed = readRecentlyClosedIds()
const initialActiveId = readActiveDocumentId()
const initialOpenRaw = readOpenDocumentIds()
const initialOpen =
  initialActiveId && !initialOpenRaw.includes(initialActiveId)
    ? [...initialOpenRaw, initialActiveId]
    : initialOpenRaw.length > 0
      ? initialOpenRaw
      : initialActiveId
        ? [initialActiveId]
        : []

const documentsSlice = createSlice({
  name: 'documents',
  initialState: {
    documents: [],
    activeDocumentId: initialActiveId,
    activeDocument: null,
    saveStatus: 'idle',
    sidebarOpen: true,
    documentOutlineOpen: readBoolStorage('scribe-document-outline-open', false),
    revisionHistoryOpen: readBoolStorage('scribe-revision-history-open', false),
    commentsPanelOpen: readBoolStorage('scribe-comments-open', false),
    statsPanelOpen: readBoolStorage('scribe-stats-open', false),
    backlinksPanelOpen: readBoolStorage('scribe-backlinks-open', false),
    focusMode: readBoolStorage('scribe-focus-mode', false),
    readingMode: false,
    manualTitleDocumentIds: readManualTitleIds(),
    findReplaceOpen: false,
    findReplaceMode: 'find',
    pendingEditorSearch: null,
    trashOpen: false,
    favoritesOnlyFilter: false,
    activeTagFilter: null,
    commentsVersion: 0,
    commentAuthor: readCommentAuthor(),
    diskSyncWarning: null,
    recentDocumentIds:
      initialActiveId && !initialRecent.includes(initialActiveId)
        ? pushRecentId(initialRecent, initialActiveId)
        : initialRecent,
    recentlyClosedIds: initialClosed,
    openDocumentIds: initialOpen,
    secondaryDocumentId: null,
  } satisfies DocumentsState,
  reducers: {
    setDocuments(state, action: PayloadAction<DocumentSummary[]>) {
      state.documents = action.payload
      const nextRecent = pruneIds(state.recentDocumentIds, action.payload)
      const nextClosed = pruneIds(state.recentlyClosedIds, action.payload)
      const nextOpen = pruneIds(state.openDocumentIds, action.payload)
      if (nextRecent.length !== state.recentDocumentIds.length) {
        state.recentDocumentIds = nextRecent
        persistRecentDocumentIds(nextRecent)
      }
      if (nextClosed.length !== state.recentlyClosedIds.length) {
        state.recentlyClosedIds = nextClosed
        persistRecentlyClosedIds(nextClosed)
      }
      if (nextOpen.length !== state.openDocumentIds.length) {
        state.openDocumentIds = nextOpen
        persistOpenDocumentIds(nextOpen)
      }
    },
    updateDocuments(state, action: PayloadAction<(prev: DocumentSummary[]) => DocumentSummary[]>) {
      state.documents = action.payload(state.documents)
      const nextRecent = pruneIds(state.recentDocumentIds, state.documents)
      const nextClosed = pruneIds(state.recentlyClosedIds, state.documents)
      const nextOpen = pruneIds(state.openDocumentIds, state.documents)
      if (nextRecent.length !== state.recentDocumentIds.length) {
        state.recentDocumentIds = nextRecent
        persistRecentDocumentIds(nextRecent)
      }
      if (nextClosed.length !== state.recentlyClosedIds.length) {
        state.recentlyClosedIds = nextClosed
        persistRecentlyClosedIds(nextClosed)
      }
      if (nextOpen.length !== state.openDocumentIds.length) {
        state.openDocumentIds = nextOpen
        persistOpenDocumentIds(nextOpen)
      }
    },
    setActiveDocumentId(state, action: PayloadAction<string | null>) {
      const prev = state.activeDocumentId
      const next = action.payload

      if (prev === next) {
        if (next && !state.openDocumentIds.includes(next)) {
          state.openDocumentIds = [...state.openDocumentIds, next]
          persistOpenDocumentIds(state.openDocumentIds)
        }
        return
      }

      if (prev && prev !== next) {
        // Switching between open tabs should not mark the previous doc as closed.
        const isTabSwitch = next != null && state.openDocumentIds.includes(prev)
        if (!isTabSwitch) {
          state.recentlyClosedIds = pushRecentId(state.recentlyClosedIds, prev)
          persistRecentlyClosedIds(state.recentlyClosedIds)
        }
      }

      if (next) {
        state.recentDocumentIds = pushRecentId(state.recentDocumentIds, next)
        persistRecentDocumentIds(state.recentDocumentIds)
        state.recentlyClosedIds = state.recentlyClosedIds.filter((id) => id !== next)
        persistRecentlyClosedIds(state.recentlyClosedIds)
        if (!state.openDocumentIds.includes(next)) {
          state.openDocumentIds = [...state.openDocumentIds, next]
          persistOpenDocumentIds(state.openDocumentIds)
        }
      }

      state.activeDocumentId = next
      persistActiveDocumentId(next)
    },
    /** Close a tab. If it was active, activates a neighbor (or clears active). */
    closeOpenDocument(state, action: PayloadAction<string>) {
      const id = action.payload
      const index = state.openDocumentIds.indexOf(id)
      if (index === -1) return

      state.openDocumentIds = state.openDocumentIds.filter((openId) => openId !== id)
      persistOpenDocumentIds(state.openDocumentIds)

      state.recentlyClosedIds = pushRecentId(state.recentlyClosedIds, id)
      persistRecentlyClosedIds(state.recentlyClosedIds)

      if (state.activeDocumentId !== id) {
        if (state.secondaryDocumentId === id) {
          state.secondaryDocumentId = null
        }
        return
      }

      const nextId =
        state.openDocumentIds[index] ?? state.openDocumentIds[index - 1] ?? null
      state.activeDocumentId = nextId
      persistActiveDocumentId(nextId)
      if (state.secondaryDocumentId === id) {
        state.secondaryDocumentId = null
      }
      if (nextId) {
        state.recentDocumentIds = pushRecentId(state.recentDocumentIds, nextId)
        persistRecentDocumentIds(state.recentDocumentIds)
        state.recentlyClosedIds = state.recentlyClosedIds.filter((closedId) => closedId !== nextId)
        persistRecentlyClosedIds(state.recentlyClosedIds)
      }
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
    setPendingEditorSearch(state, action: PayloadAction<string | null>) {
      state.pendingEditorSearch = action.payload
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
    setSecondaryDocumentId(state, action: PayloadAction<string | null>) {
      const id = action.payload
      if (id && id === state.activeDocumentId) {
        state.secondaryDocumentId = null
        return
      }
      state.secondaryDocumentId = id
      if (id && !state.openDocumentIds.includes(id)) {
        state.openDocumentIds = [...state.openDocumentIds, id]
        persistOpenDocumentIds(state.openDocumentIds)
      }
    },
  },
})

export const {
  setDocuments,
  updateDocuments,
  setActiveDocumentId,
  closeOpenDocument,
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
  setPendingEditorSearch,
  setTrashOpen,
  setFavoritesOnlyFilter,
  toggleFavoritesOnlyFilter,
  setActiveTagFilter,
  bumpCommentsVersion,
  setCommentAuthor,
  setDiskSyncWarning,
  setSecondaryDocumentId,
} = documentsSlice.actions

export default documentsSlice.reducer
