import { describe, expect, it } from 'vitest'
import { buildTree, flattenTree } from '@/lib/library/tree'
import type { DocumentSummary, Folder } from '@/lib/db/api'

const folders: Folder[] = [
  {
    id: 'f1',
    name: 'Projekty',
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'f2',
    name: 'Archív',
    parentId: 'f1',
    createdAt: 1,
    updatedAt: 1,
  },
]

const documents: DocumentSummary[] = [
  {
    id: 'd1',
    title: 'Poznámky',
    folderId: 'f1',
    filePath: null,
    updatedAt: 2,
  },
  {
    id: 'd2',
    title: 'Root doc',
    folderId: null,
    filePath: null,
    updatedAt: 3,
  },
]

describe('buildTree', () => {
  it('nests folders and documents', () => {
    const tree = buildTree(folders, documents)
    expect(tree).toHaveLength(2)
    const projects = tree.find((node) => node.type === 'folder' && node.folder.id === 'f1')
    expect(projects?.type).toBe('folder')
    if (projects?.type !== 'folder') return
    expect(projects.children.some((child) => child.type === 'document' && child.document.id === 'd1')).toBe(true)
    expect(projects.children.some((child) => child.type === 'folder' && child.folder.id === 'f2')).toBe(true)
  })
})

describe('flattenTree', () => {
  it('includes only expanded branches', () => {
    const tree = buildTree(folders, documents)
    const collapsed = flattenTree(tree, new Set())
    expect(collapsed.map((item) => (item.type === 'folder' ? item.folder.id : item.document.id))).toEqual([
      'f1',
      'd2',
    ])

    const expanded = flattenTree(tree, new Set(['f1']))
    expect(expanded.some((item) => item.type === 'document' && item.document.id === 'd1')).toBe(true)
    expect(expanded.some((item) => item.type === 'folder' && item.folder.id === 'f2')).toBe(true)
  })
})
