import { describe, expect, it, vi, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import documentsReducer from '@/store/documentsSlice'
import { applyDiskPersistResult } from '@/lib/disk-sync'
import type { AppDispatch } from '@/store/index'

const toastInfo = vi.fn()

vi.mock('@/lib/toast', () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/store/persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/persistence')>()
  return {
    ...actual,
    hasStorageFolderAccess: () => true,
  }
})

vi.mock('@/components/StorageAccessDialogHost', () => ({
  requestStorageAccessDialog: vi.fn(),
}))

describe('applyDiskPersistResult', () => {
  beforeEach(() => {
    toastInfo.mockClear()
  })

  it('clears the warning when persist succeeds', () => {
    const store = configureStore({ reducer: { documents: documentsReducer } })
    store.dispatch({ type: 'documents/setDiskSyncWarning', payload: 'stale' })
    applyDiskPersistResult(store.dispatch as AppDispatch, { flushed: 2, errors: [] })
    expect(store.getState().documents.diskSyncWarning).toBeNull()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('sets a warning and toasts the first persist error', () => {
    const store = configureStore({ reducer: { documents: documentsReducer } })
    applyDiskPersistResult(store.dispatch as AppDispatch, {
      flushed: 0,
      errors: [{ path: '/tmp/note.md', message: 'permission denied' }],
    })
    expect(store.getState().documents.diskSyncWarning).toContain('permission denied')
    expect(toastInfo).toHaveBeenCalled()
  })
})
