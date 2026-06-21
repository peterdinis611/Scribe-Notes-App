import { describe, expect, it } from 'vitest'
import { flattenFoldersForPicker, folderPathLabel } from '@/lib/library/folders'
import type { Folder } from '@/lib/db/api'

const folders: Folder[] = [
  { id: 'f1', name: 'Projekty', parentId: null, createdAt: 1, updatedAt: 1 },
  { id: 'f2', name: 'Archív', parentId: 'f1', createdAt: 1, updatedAt: 1 },
]

describe('flattenFoldersForPicker', () => {
  it('returns nested folders in tree order', () => {
    expect(flattenFoldersForPicker(folders).map((item) => item.folder.id)).toEqual(['f1', 'f2'])
    expect(flattenFoldersForPicker(folders)[1]?.depth).toBe(1)
  })
})

describe('folderPathLabel', () => {
  it('builds breadcrumb path', () => {
    expect(folderPathLabel(folders, 'f2')).toBe('Projekty / Archív')
    expect(folderPathLabel(folders, null)).toBe('Koreň')
  })
})
