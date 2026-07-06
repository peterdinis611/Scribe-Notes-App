import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Folder } from '@/lib/db/api'

export interface FoldersState {
  folders: Folder[]
  expandedFolderIds: string[]
  commandPaletteOpen: boolean
  moveDocumentPickerOpen: boolean
}

const initialState: FoldersState = {
  folders: [],
  expandedFolderIds: [],
  commandPaletteOpen: false,
  moveDocumentPickerOpen: false,
}

const foldersSlice = createSlice({
  name: 'folders',
  initialState,
  reducers: {
    setFolders(state, action: PayloadAction<Folder[]>) {
      state.folders = action.payload
    },
    updateFolders(state, action: PayloadAction<(prev: Folder[]) => Folder[]>) {
      state.folders = action.payload(state.folders)
    },
    setExpandedFolderIds(state, action: PayloadAction<string[]>) {
      state.expandedFolderIds = action.payload
    },
    updateExpandedFolderIds(state, action: PayloadAction<(prev: string[]) => string[]>) {
      state.expandedFolderIds = action.payload(state.expandedFolderIds)
    },
    toggleExpandedFolder(state, action: PayloadAction<string>) {
      const id = action.payload
      if (state.expandedFolderIds.includes(id)) {
        state.expandedFolderIds = state.expandedFolderIds.filter((item) => item !== id)
      } else {
        state.expandedFolderIds.push(id)
      }
    },
    setCommandPaletteOpen(state, action: PayloadAction<boolean>) {
      state.commandPaletteOpen = action.payload
    },
    toggleCommandPaletteOpen(state) {
      state.commandPaletteOpen = !state.commandPaletteOpen
    },
    setMoveDocumentPickerOpen(state, action: PayloadAction<boolean>) {
      state.moveDocumentPickerOpen = action.payload
    },
  },
})

export const {
  setFolders,
  updateFolders,
  setExpandedFolderIds,
  updateExpandedFolderIds,
  toggleExpandedFolder,
  setCommandPaletteOpen,
  toggleCommandPaletteOpen,
  setMoveDocumentPickerOpen,
} = foldersSlice.actions

export default foldersSlice.reducer
