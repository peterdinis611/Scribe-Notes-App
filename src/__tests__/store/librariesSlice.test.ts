import { describe, expect, it } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import librariesReducer, { setLibraries, setOpenConflictCount } from '@/store/librariesSlice'
import type { Library } from '@/lib/db/libraries-api'

const library: Library = {
  id: 'work',
  name: 'Work',
  rootPath: '/tmp/work',
  createdAt: 1,
  lastOpenedAt: 2,
  sortOrder: 1,
  isActive: true,
}

describe('librariesSlice', () => {
  it('stores libraries and open conflict count', () => {
    const store = configureStore({ reducer: { libraries: librariesReducer } })
    store.dispatch(setLibraries([library]))
    store.dispatch(setOpenConflictCount(3))
    expect(store.getState().libraries.libraries).toEqual([library])
    expect(store.getState().libraries.openConflictCount).toBe(3)
  })
})
