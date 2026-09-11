import { describe, expect, it } from 'vitest'
import { suggestFolderFromTags } from '@/lib/library/auto-organize'
import type { Folder } from '@/lib/db/api'

function folder(partial: Partial<Folder> & Pick<Folder, 'id' | 'name'>): Folder {
  return {
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    isPinned: false,
    ...partial,
  }
}

describe('suggestFolderFromTags', () => {
  it('matches folder names to tag terms', () => {
    const folders = [
      folder({ id: '1', name: 'Work' }),
      folder({ id: '2', name: 'Personal projects' }),
    ]
    expect(suggestFolderFromTags(folders, ['projects'])?.id).toBe('2')
    expect(suggestFolderFromTags(folders, ['work'])?.id).toBe('1')
  })

  it('returns null when nothing matches', () => {
    expect(suggestFolderFromTags([folder({ id: '1', name: 'Inbox' })], ['travel'])).toBeNull()
  })
})
