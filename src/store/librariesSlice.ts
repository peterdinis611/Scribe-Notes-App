import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Library } from '@/lib/db/libraries-api'

export interface LibrariesState {
  libraries: Library[]
}

const initialState: LibrariesState = {
  libraries: [],
}

const librariesSlice = createSlice({
  name: 'libraries',
  initialState,
  reducers: {
    setLibraries(state, action: PayloadAction<Library[]>) {
      state.libraries = action.payload
    },
  },
})

export const { setLibraries } = librariesSlice.actions
export default librariesSlice.reducer
