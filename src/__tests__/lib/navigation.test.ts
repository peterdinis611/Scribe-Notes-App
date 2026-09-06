import { beforeEach, describe, expect, it, vi } from 'vitest'
import { closeActiveDocumentAndMaybeHome, goToHome } from '@/lib/navigation'

const navigate = vi.fn()
const dispatch = vi.fn()

vi.mock('@/lib/cache/document-cache', () => ({
  peekCachedDocument: vi.fn(() => null),
}))

describe('closeActiveDocumentAndMaybeHome', () => {
  beforeEach(() => {
    navigate.mockReset()
    dispatch.mockReset()
  })

  it('does not close pinned tabs', () => {
    closeActiveDocumentAndMaybeHome({
      activeId: 'a',
      openDocumentIds: ['a', 'b'],
      pinnedDocumentIds: ['a'],
      dispatch,
      navigate,
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('navigates to the next open tab when closing', () => {
    closeActiveDocumentAndMaybeHome({
      activeId: 'a',
      openDocumentIds: ['a', 'b'],
      pinnedDocumentIds: [],
      dispatch,
      navigate,
    })
    expect(dispatch).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith({
      to: '/doc/$documentId',
      params: { documentId: 'b' },
    })
  })

  it('goes home when closing the last tab', () => {
    closeActiveDocumentAndMaybeHome({
      activeId: 'a',
      openDocumentIds: ['a'],
      pinnedDocumentIds: [],
      dispatch,
      navigate,
    })
    expect(navigate).toHaveBeenCalledWith({ to: '/' })
  })
})

describe('goToHome', () => {
  beforeEach(() => {
    navigate.mockReset()
    dispatch.mockReset()
  })

  it('clears active document and navigates home', () => {
    goToHome({ dispatch, navigate })
    expect(dispatch).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith({ to: '/' })
  })
})
