import { describe, expect, it, vi, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import documentsReducer from '@/store/documentsSlice'
import foldersReducer from '@/store/foldersSlice'
import settingsReducer, { setLocale } from '@/store/settingsSlice'
import { getResolvedHotkey } from '@/lib/shortcuts'
import { openQuickNote } from '@/lib/quick-note'
import { reloadLibraryFromBackend } from '@/lib/library-reload'
import { readLocale, persistLocale } from '@/store/persistence'
import type { Document, DocumentSummary } from '@/lib/db/api'

vi.mock('@/lib/db/api', () => ({
  createDocument: vi.fn(),
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  listFolders: vi.fn(),
  getStorageSettings: vi.fn(),
}))

vi.mock('@/lib/cache/document-cache', () => ({
  cacheDocument: (doc: Document) => doc,
}))

import {
  createDocument,
  getDocument,
  listDocuments,
  listFolders,
  getStorageSettings,
} from '@/lib/db/api'

function summary(id: string, title: string): DocumentSummary {
  return {
    id,
    title,
    updatedAt: 1,
    createdAt: 1,
    deletedAt: null,
    folderId: null,
    filePath: null,
    isFavorite: false,
    tags: [],
  }
}

function document(id: string, title: string): Document {
  return {
    ...summary(id, title),
    contentJson: '{"type":"doc","content":[]}',
  }
}

describe('critical flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('opens an existing scratch document instead of creating a new one', async () => {
    localStorage.setItem('scribe-scratch-document-id', 'scratch-1')
    vi.mocked(getDocument).mockResolvedValue(document('scratch-1', 'Rýchla poznámka'))

    const store = configureStore({
      reducer: {
        documents: documentsReducer,
        folders: foldersReducer,
        settings: settingsReducer,
      },
    })

    const navigate = vi.fn()
    await openQuickNote(
      [summary('scratch-1', 'Rýchla poznámka')],
      store.dispatch,
      navigate,
      () => 'Rýchla poznámka',
    )

    expect(createDocument).not.toHaveBeenCalled()
    expect(store.getState().documents.activeDocumentId).toBe('scratch-1')
    expect(navigate).toHaveBeenCalled()
  })

  it('creates a scratch document when none exists', async () => {
    vi.mocked(createDocument).mockResolvedValue(document('new-scratch', 'Rýchla poznámka'))

    const store = configureStore({
      reducer: {
        documents: documentsReducer,
        folders: foldersReducer,
        settings: settingsReducer,
      },
    })

    await openQuickNote([], store.dispatch, vi.fn(), () => 'Rýchla poznámka')

    expect(createDocument).toHaveBeenCalled()
    expect(localStorage.getItem('scribe-scratch-document-id')).toBe('new-scratch')
    expect(store.getState().documents.documents).toHaveLength(1)
  })

  it('applies custom shortcut overrides', () => {
    expect(getResolvedHotkey('quickNote', {})).toBe('Mod+Shift+N')
    expect(getResolvedHotkey('quickNote', { quickNote: 'Mod+Alt+Q' })).toBe('Mod+Alt+Q')
  })

  it('persists locale switch SK/EN', () => {
    const store = configureStore({
      reducer: {
        documents: documentsReducer,
        folders: foldersReducer,
        settings: settingsReducer,
      },
    })

    store.dispatch(setLocale('en'))
    expect(store.getState().settings.locale).toBe('en')
    expect(readLocale()).toBe('en')

    store.dispatch(setLocale('sk'))
    expect(readLocale()).toBe('sk')
    persistLocale('en')
    expect(readLocale()).toBe('en')
  })

  it('reloads library state after backup import', async () => {
    vi.mocked(listDocuments).mockResolvedValue([summary('doc-1', 'Imported')])
    vi.mocked(listFolders).mockResolvedValue([])
    vi.mocked(getStorageSettings).mockResolvedValue({
      documentsDir: '/tmp/scribe',
      folderAccessGranted: true,
    })

    const store = configureStore({
      reducer: {
        documents: documentsReducer,
        folders: foldersReducer,
        settings: settingsReducer,
      },
      preloadedState: {
        documents: {
          ...documentsReducer(undefined, { type: 'init' }),
          activeDocumentId: 'old-doc',
        },
        folders: foldersReducer(undefined, { type: 'init' }),
        settings: settingsReducer(undefined, { type: 'init' }),
      },
    })

    await reloadLibraryFromBackend(store.dispatch)

    expect(store.getState().documents.documents).toHaveLength(1)
    expect(store.getState().documents.activeDocumentId).toBeNull()
    expect(store.getState().settings.storageSettings?.documentsDir).toBe('/tmp/scribe')
  })
})
