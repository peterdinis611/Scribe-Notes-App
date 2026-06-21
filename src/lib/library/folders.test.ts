import { describe, expect, it } from 'vitest'
import {
  buildDeleteFolderConfirmMessage,
  collectFolderSubtreeIds,
  countDocumentsInFolders,
  flattenFoldersForPicker,
  folderPathLabel,
  formatSlovakDocumentCount,
} from '@/lib/library/folders'
import type { Folder } from '@/lib/db/api'

const folders: Folder[] = [
  { id: 'f1', name: 'Projekty', parentId: null, createdAt: 1, updatedAt: 1 },
  { id: 'f2', name: 'Archív', parentId: 'f1', createdAt: 1, updatedAt: 1 },
  { id: 'f3', name: 'Osobné', parentId: null, createdAt: 1, updatedAt: 1 },
]

const documents = [
  { id: 'd1', folderId: 'f1' },
  { id: 'd2', folderId: 'f2' },
  { id: 'd3', folderId: 'f3' },
  { id: 'd4', folderId: null },
]

describe('flattenFoldersForPicker', () => {
  it('returns nested folders in tree order', () => {
    const items = flattenFoldersForPicker(folders)
    expect(items.map((item) => item.folder.id)).toEqual(['f3', 'f1', 'f2'])
    expect(items.find((item) => item.folder.id === 'f2')?.depth).toBe(1)
  })
})

describe('folderPathLabel', () => {
  it('builds breadcrumb path', () => {
    expect(folderPathLabel(folders, 'f2')).toBe('Projekty / Archív')
    expect(folderPathLabel(folders, null)).toBe('Koreň')
  })
})

describe('collectFolderSubtreeIds', () => {
  it('includes nested folders', () => {
    expect([...collectFolderSubtreeIds(folders, 'f1')].sort()).toEqual(['f1', 'f2'])
    expect([...collectFolderSubtreeIds(folders, 'f3')]).toEqual(['f3'])
  })
})

describe('delete folder helpers', () => {
  it('counts documents in subtree', () => {
    expect(countDocumentsInFolders(documents, collectFolderSubtreeIds(folders, 'f1'))).toBe(2)
    expect(countDocumentsInFolders(documents, collectFolderSubtreeIds(folders, 'f3'))).toBe(1)
  })

  it('builds confirm message with document count', () => {
    expect(formatSlovakDocumentCount(1)).toBe('1 dokument')
    expect(formatSlovakDocumentCount(3)).toBe('3 dokumenty')
    expect(buildDeleteFolderConfirmMessage('Projekty', 2)).toContain('2 dokumenty')
    expect(buildDeleteFolderConfirmMessage('Prázdny', 0)).toContain('podpriečinky')
  })
})
