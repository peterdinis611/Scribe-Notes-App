import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Library } from '@/lib/db/libraries-api'

export interface LibrariesState {
  libraries: Library[]
  openConflictCount: number
}

const initialState: LibrariesState = {
  libraries: [],
  openConflictCount: 0,
}

const librariesSlice = createSlice({
  name: 'libraries',
  initialState,
  reducers: {
    setLibraries(state, action: PayloadAction<Library[]>) {
      state.libraries = action.payload
    },
    setOpenConflictCount(state, action: PayloadAction<number>) {
      state.openConflictCount = action.payload
    },
  },
})

export const { setLibraries, setOpenConflictCount } = librariesSlice.actions
export default librariesSlice.reducer
