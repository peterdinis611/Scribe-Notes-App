import { describe, expect, it } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import documentsReducer, {
  closeAllOpenDocuments,
  closeOpenDocument,
  closeOtherOpenDocuments,
  reorderOpenDocuments,
  restoreLibrarySession,
  togglePinnedDocument,
} from '@/store/documentsSlice'
import { readOpenDocumentIds } from '@/store/persistence'

function storeWithTabs(ids: string[], active = ids[0] ?? null) {
  const store = configureStore({ reducer: { documents: documentsReducer } })
  store.dispatch(
    restoreLibrarySession({
      openDocumentIds: ids,
      pinnedDocumentIds: [],
      recentDocumentIds: [],
      recentlyClosedIds: [],
      activeDocumentId: active,
    }),
  )
  return store
}

describe('documentsSlice tabs', () => {
  it('reorders open document tabs and persists the order', () => {
    const store = storeWithTabs(['a', 'b', 'c'])
    store.dispatch(reorderOpenDocuments({ fromId: 'c', toId: 'a' }))
    expect(store.getState().documents.openDocumentIds).toEqual(['c', 'a', 'b'])
    expect(readOpenDocumentIds()).toEqual(['c', 'a', 'b'])
  })

  it('ignores a no-op reorder', () => {
    const store = storeWithTabs(['a', 'b'])
    store.dispatch(reorderOpenDocuments({ fromId: 'a', toId: 'a' }))
    expect(store.getState().documents.openDocumentIds).toEqual(['a', 'b'])
  })

  it('activates a neighbor when closing the active tab', () => {
    const store = storeWithTabs(['a', 'b', 'c'], 'b')
    store.dispatch(closeOpenDocument('b'))
    expect(store.getState().documents.openDocumentIds).toEqual(['a', 'c'])
    expect(store.getState().documents.activeDocumentId).toBe('c')
  })

  it('keeps pinned tabs open', () => {
    const store = storeWithTabs(['a', 'b'])
    store.dispatch(togglePinnedDocument('a'))
    store.dispatch(closeOpenDocument('a'))
    expect(store.getState().documents.openDocumentIds).toEqual(['a', 'b'])
    expect(store.getState().documents.pinnedDocumentIds).toEqual(['a'])
  })

  it('closes all unpinned tabs and keeps pins', () => {
    const store = storeWithTabs(['a', 'b', 'c'], 'b')
    store.dispatch(togglePinnedDocument('a'))
    store.dispatch(closeAllOpenDocuments())
    expect(store.getState().documents.openDocumentIds).toEqual(['a'])
    expect(store.getState().documents.activeDocumentId).toBe('a')
  })

  it('closes other unpinned tabs', () => {
    const store = storeWithTabs(['a', 'b', 'c'], 'a')
    store.dispatch(closeOtherOpenDocuments('b'))
    expect(store.getState().documents.openDocumentIds).toEqual(['b'])
    expect(store.getState().documents.activeDocumentId).toBe('b')
  })
})
