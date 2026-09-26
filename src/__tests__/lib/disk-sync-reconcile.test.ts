import { describe, expect, it, vi, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import documentsReducer from '@/store/documentsSlice'
import librariesReducer from '@/store/librariesSlice'
import uiReducer from '@/store/uiSlice'
import { applyFolderReconcileResult } from '@/lib/disk-sync'
import type { AppDispatch } from '@/store/index'
import type { ReconcileResult } from '@/lib/db/api'

const toastInfo = vi.fn()

vi.mock('@/lib/toast', () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/lib/library-reload', () => ({
  reloadLibraryFromBackend: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db/libraries-api', () => ({
  listSyncConflicts: vi.fn(async () => []),
}))

function makeStore() {
  return configureStore({
    reducer: {
      documents: documentsReducer,
      libraries: librariesReducer,
      ui: uiReducer,
    },
  })
}

describe('applyFolderReconcileResult', () => {
  beforeEach(() => {
    toastInfo.mockClear()
  })

  it('records folder sync status without toasting when nothing changed', async () => {
    const store = makeStore()
    const result: ReconcileResult = {
      scannedCount: 3,
      importedCount: 0,
      updatedFromDiskCount: 0,
      syncedToDiskCount: 1,
      conflictCount: 0,
    }
    await applyFolderReconcileResult(store.dispatch as AppDispatch, result)
    expect(store.getState().documents.folderSyncStatus?.scannedCount).toBe(3)
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('toasts when documents were updated from disk', async () => {
    const store = makeStore()
    const result: ReconcileResult = {
      scannedCount: 5,
      importedCount: 0,
      updatedFromDiskCount: 2,
      syncedToDiskCount: 0,
      conflictCount: 0,
    }
    await applyFolderReconcileResult(store.dispatch as AppDispatch, result)
    expect(toastInfo).toHaveBeenCalled()
    expect(store.getState().documents.folderSyncStatus?.updatedFromDiskCount).toBe(2)
  })
})
