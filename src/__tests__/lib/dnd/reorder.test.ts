import { describe, expect, it } from 'vitest'
import { canNestFolder, moveIdBefore } from '@/lib/dnd/reorder'
import { isLibraryDragItem } from '@/lib/library/folder-tree-drag'

describe('moveIdBefore', () => {
  it('moves an id in front of another', () => {
    expect(moveIdBefore(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
    expect(moveIdBefore(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'a', 'c'])
  })

  it('returns the same array when nothing changes', () => {
    const ids = ['a', 'b']
    expect(moveIdBefore(ids, 'a', 'a')).toBe(ids)
    expect(moveIdBefore(ids, 'z', 'a')).toBe(ids)
    const already = ['b', 'a', 'c']
    expect(moveIdBefore(already, 'a', 'c')).toBe(already)
  })
})

describe('canNestFolder', () => {
  const folders = [
    { id: 'root-a', parentId: null },
    { id: 'child', parentId: 'root-a' },
    { id: 'leaf', parentId: 'child' },
    { id: 'other', parentId: null },
  ]

  it('blocks dropping a folder into itself or a descendant', () => {
    expect(canNestFolder('root-a', 'root-a', folders)).toBe(false)
    expect(canNestFolder('root-a', 'leaf', folders)).toBe(false)
    expect(canNestFolder('child', 'leaf', folders)).toBe(false)
  })

  it('allows moving into another branch or to root', () => {
    expect(canNestFolder('leaf', 'other', folders)).toBe(true)
    expect(canNestFolder('child', null, folders)).toBe(true)
  })
})

describe('isLibraryDragItem', () => {
  it('accepts document and folder payloads', () => {
    expect(isLibraryDragItem({ kind: 'document', id: '1' })).toBe(true)
    expect(isLibraryDragItem({ kind: 'folder', id: '2' })).toBe(true)
    expect(isLibraryDragItem({ kind: 'document' })).toBe(false)
    expect(isLibraryDragItem(null)).toBe(false)
  })
})
