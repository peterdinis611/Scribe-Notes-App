import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Document, DocumentSummary } from '@/lib/db/api'
import { isLibraryDocumentVisible } from '@/lib/db/library-sync'
import {
  persistBoolStorage,
  persistCommentAuthor,
  persistDocumentTocLeftOpen,
  persistManualTitleIds,
  persistActiveDocumentId,
  persistOpenDocumentIds,
  persistPinnedDocumentIds,
  persistRecentDocumentIds,
  persistRecentlyClosedIds,
  pushRecentId,
  readActiveDocumentId,
  readBoolStorage,
  readCommentAuthor,
  readDocumentTocLeftOpen,
  readManualTitleIds,
  readOpenDocumentIds,
  readPinnedDocumentIds,
  readRecentDocumentIds,
  readRecentlyClosedIds,
} from '@/store/persistence'
import type { MetaFilters } from '@/lib/library/tag-meta'
import { EMPTY_META_FILTERS } from '@/lib/library/tag-meta'
import type { LibrarySmartFilter } from '@/lib/library/smart-filters'

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
  insightsPanelOpen: boolean
  /** Right panel icon rail; collapsed by default for a quieter writing chrome. */
  panelRailExpanded: boolean
  focusMode: boolean
  readingMode: boolean
  manualTitleDocumentIds: string[]
  findReplaceOpen: boolean
  findReplaceMode: 'find' | 'replace'
  libraryFindReplaceOpen: boolean
  pendingEditorSearch: string | null
  pendingLibraryView: {
    view: 'folders' | 'recent' | 'favorites' | 'tags' | 'graph' | 'journal'
    aroundActive?: boolean
  } | null
  trashOpen: boolean
  favoritesOnlyFilter: boolean
  activeTagFilter: string | null
  metaFilters: MetaFilters
  commentsVersion: number
  commentAuthor: string
  diskSyncWarning: string | null
  /** Most-recently activated document ids (newest first). */
  recentDocumentIds: string[]
  /** Documents left when switching away (newest first). */
  recentlyClosedIds: string[]
  /** Open editor tabs (left-to-right order). */
  openDocumentIds: string[]
  /** Tabs that stay open until unpinned (subset of openDocumentIds). */
  pinnedDocumentIds: string[]
  /** Document shown in the right split pane (null = no split). */
  secondaryDocumentId: string | null
  /** Wiki-link back trail (session only, newest last). */
  documentNavStack: string[]
  /** Left margin TOC rail (headings). */
  documentTocLeftOpen: boolean
  /** Scroll position to restore after outline jump. */
  outlineReturnPoint: { docId: string; scrollTop: number } | null
  /** Sidebar smart filter. */
  librarySmartFilter: LibrarySmartFilter
  /** Multi-select in library views. */
  selectedDocumentIds: string[]
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

const initialState: DocumentsState = {
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
  insightsPanelOpen: readBoolStorage('scribe-insights-open', false),
  panelRailExpanded: readBoolStorage('scribe-panel-rail-expanded', false),
  focusMode: readBoolStorage('scribe-focus-mode', false),
  readingMode: readBoolStorage('scribe-reading-mode', false),
  manualTitleDocumentIds: readManualTitleIds(),
  findReplaceOpen: false,
  findReplaceMode: 'find',
  libraryFindReplaceOpen: false,
  pendingEditorSearch: null,
  pendingLibraryView: null,
  trashOpen: false,
  favoritesOnlyFilter: false,
  activeTagFilter: null,
  metaFilters: EMPTY_META_FILTERS,
  commentsVersion: 0,
  commentAuthor: readCommentAuthor(),
  diskSyncWarning: null,
  recentDocumentIds:
    initialActiveId && !initialRecent.includes(initialActiveId)
      ? pushRecentId(initialRecent, initialActiveId)
      : initialRecent,
  recentlyClosedIds: initialClosed,
  openDocumentIds: initialOpen,
  pinnedDocumentIds: readPinnedDocumentIds(),
  secondaryDocumentId: null,
  documentNavStack: [],
  documentTocLeftOpen: readDocumentTocLeftOpen(),
  outlineReturnPoint: null,
  librarySmartFilter: 'none',
  selectedDocumentIds: [],
}

const documentsSlice = createSlice({
  name: 'documents',
  initialState,
  reducers: {
    setDocuments(state, action: PayloadAction<DocumentSummary[]>) {
      state.documents = action.payload
      const nextRecent = pruneIds(state.recentDocumentIds, action.payload)
      const nextClosed = pruneIds(state.recentlyClosedIds, action.payload)
      const nextOpen = pruneIds(state.openDocumentIds, action.payload)
      const nextPinned = pruneIds(state.pinnedDocumentIds, action.payload)
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
      if (nextPinned.length !== state.pinnedDocumentIds.length) {
        state.pinnedDocumentIds = nextPinned
        persistPinnedDocumentIds(nextPinned)
      }
    },
    updateDocuments(state, action: PayloadAction<(prev: DocumentSummary[]) => DocumentSummary[]>) {
      state.documents = action.payload(state.documents).filter(isLibraryDocumentVisible)
      const nextRecent = pruneIds(state.recentDocumentIds, state.documents)
      const nextClosed = pruneIds(state.recentlyClosedIds, state.documents)
      const nextOpen = pruneIds(state.openDocumentIds, state.documents)
      const nextPinned = pruneIds(state.pinnedDocumentIds, state.documents)
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
      if (nextPinned.length !== state.pinnedDocumentIds.length) {
        state.pinnedDocumentIds = nextPinned
        persistPinnedDocumentIds(nextPinned)
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
    /** Close a tab. If it was active, activates a neighbor (or clears active). Pinned tabs are ignored. */
    closeOpenDocument(state, action: PayloadAction<string>) {
      const id = action.payload
      if (state.pinnedDocumentIds.includes(id)) return

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
    togglePinnedDocument(state, action: PayloadAction<string>) {
      const id = action.payload
      if (state.pinnedDocumentIds.includes(id)) {
        state.pinnedDocumentIds = state.pinnedDocumentIds.filter((item) => item !== id)
      } else {
        if (!state.openDocumentIds.includes(id)) {
          state.openDocumentIds = [...state.openDocumentIds, id]
          persistOpenDocumentIds(state.openDocumentIds)
        }
        state.pinnedDocumentIds = [...state.pinnedDocumentIds, id]
      }
      persistPinnedDocumentIds(state.pinnedDocumentIds)
    },
    setPinnedDocumentIds(state, action: PayloadAction<string[]>) {
      state.pinnedDocumentIds = action.payload
      persistPinnedDocumentIds(action.payload)
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
      if (action.payload) {
        state.panelRailExpanded = true
        persistBoolStorage('scribe-panel-rail-expanded', true)
      }
    },
    setRevisionHistoryOpen(state, action: PayloadAction<boolean>) {
      state.revisionHistoryOpen = action.payload
      persistBoolStorage('scribe-revision-history-open', action.payload)
      if (action.payload) {
        state.panelRailExpanded = true
        persistBoolStorage('scribe-panel-rail-expanded', true)
      }
    },
    setCommentsPanelOpen(state, action: PayloadAction<boolean>) {
      state.commentsPanelOpen = action.payload
      persistBoolStorage('scribe-comments-open', action.payload)
      if (action.payload) {
        state.panelRailExpanded = true
        persistBoolStorage('scribe-panel-rail-expanded', true)
      }
    },
    setStatsPanelOpen(state, action: PayloadAction<boolean>) {
      state.statsPanelOpen = action.payload
      persistBoolStorage('scribe-stats-open', action.payload)
      if (action.payload) {
        state.panelRailExpanded = true
        persistBoolStorage('scribe-panel-rail-expanded', true)
      }
    },
    setBacklinksPanelOpen(state, action: PayloadAction<boolean>) {
      state.backlinksPanelOpen = action.payload
      persistBoolStorage('scribe-backlinks-open', action.payload)
      if (action.payload) {
        state.panelRailExpanded = true
        persistBoolStorage('scribe-panel-rail-expanded', true)
      }
    },
    setInsightsPanelOpen(state, action: PayloadAction<boolean>) {
      state.insightsPanelOpen = action.payload
      persistBoolStorage('scribe-insights-open', action.payload)
      if (action.payload) {
        state.panelRailExpanded = true
        persistBoolStorage('scribe-panel-rail-expanded', true)
      }
    },
    setPanelRailExpanded(state, action: PayloadAction<boolean>) {
      state.panelRailExpanded = action.payload
      persistBoolStorage('scribe-panel-rail-expanded', action.payload)
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
    setLibraryFindReplaceOpen(state, action: PayloadAction<boolean>) {
      state.libraryFindReplaceOpen = action.payload
    },
    setPendingEditorSearch(state, action: PayloadAction<string | null>) {
      state.pendingEditorSearch = action.payload
    },
    setPendingLibraryView(
      state,
      action: PayloadAction<{
        view: 'folders' | 'recent' | 'favorites' | 'tags' | 'graph' | 'journal'
        aroundActive?: boolean
      } | null>,
    ) {
      state.pendingLibraryView = action.payload
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
    setMetaFilters(state, action: PayloadAction<Partial<MetaFilters>>) {
      state.metaFilters = { ...state.metaFilters, ...action.payload }
    },
    clearMetaFilters(state) {
      state.metaFilters = EMPTY_META_FILTERS
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
    pushDocumentNav(state, action: PayloadAction<string>) {
      const fromId = action.payload
      if (!fromId || fromId === state.activeDocumentId) return
      const last = state.documentNavStack[state.documentNavStack.length - 1]
      if (last === fromId) return
      state.documentNavStack = [...state.documentNavStack, fromId]
    },
    popDocumentNav(state) {
      state.documentNavStack = state.documentNavStack.slice(0, -1)
    },
    trimDocumentNavTo(state, action: PayloadAction<string>) {
      const index = state.documentNavStack.indexOf(action.payload)
      if (index >= 0) {
        state.documentNavStack = state.documentNavStack.slice(0, index)
      }
    },
    clearDocumentNav(state) {
      state.documentNavStack = []
    },
    setDocumentTocLeftOpen(state, action: PayloadAction<boolean>) {
      state.documentTocLeftOpen = action.payload
      persistDocumentTocLeftOpen(action.payload)
    },
    toggleDocumentTocLeftOpen(state) {
      state.documentTocLeftOpen = !state.documentTocLeftOpen
      persistDocumentTocLeftOpen(state.documentTocLeftOpen)
    },
    setOutlineReturnPoint(
      state,
      action: PayloadAction<{ docId: string; scrollTop: number } | null>,
    ) {
      state.outlineReturnPoint = action.payload
    },
    setLibrarySmartFilter(state, action: PayloadAction<LibrarySmartFilter>) {
      state.librarySmartFilter = action.payload
    },
    setSelectedDocumentIds(state, action: PayloadAction<string[]>) {
      state.selectedDocumentIds = action.payload
    },
    toggleSelectedDocument(state, action: PayloadAction<string>) {
      const id = action.payload
      if (state.selectedDocumentIds.includes(id)) {
        state.selectedDocumentIds = state.selectedDocumentIds.filter((item) => item !== id)
      } else {
        state.selectedDocumentIds = [...state.selectedDocumentIds, id]
      }
    },
    clearSelectedDocuments(state) {
      state.selectedDocumentIds = []
    },
  },
})

export const {
  setDocuments,
  updateDocuments,
  setActiveDocumentId,
  closeOpenDocument,
  togglePinnedDocument,
  setPinnedDocumentIds,
  setActiveDocument,
  setSaveStatus,
  setSidebarOpen,
  setDocumentOutlineOpen,
  setRevisionHistoryOpen,
  setCommentsPanelOpen,
  setStatsPanelOpen,
  setBacklinksPanelOpen,
  setInsightsPanelOpen,
  setPanelRailExpanded,
  setFocusMode,
  toggleFocusMode,
  setReadingMode,
  toggleReadingMode,
  setManualTitleDocumentIds,
  markDocumentTitleManual,
  setFindReplaceOpen,
  toggleFindReplaceOpen,
  setFindReplaceMode,
  setLibraryFindReplaceOpen,
  setPendingEditorSearch,
  setPendingLibraryView,
  setTrashOpen,
  setFavoritesOnlyFilter,
  toggleFavoritesOnlyFilter,
  setActiveTagFilter,
  setMetaFilters,
  clearMetaFilters,
  bumpCommentsVersion,
  setCommentAuthor,
  setDiskSyncWarning,
  setSecondaryDocumentId,
  pushDocumentNav,
  popDocumentNav,
  trimDocumentNavTo,
  clearDocumentNav,
  setDocumentTocLeftOpen,
  toggleDocumentTocLeftOpen,
  setOutlineReturnPoint,
  setLibrarySmartFilter,
  setSelectedDocumentIds,
  toggleSelectedDocument,
  clearSelectedDocuments,
} = documentsSlice.actions

export default documentsSlice.reducer
