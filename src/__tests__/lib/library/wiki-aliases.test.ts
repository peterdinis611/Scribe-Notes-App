import { describe, expect, it } from 'vitest'
import type { DocumentSummary } from '@/lib/db/api'
import {
  addAliasTag,
  findDocumentByTitleOrAlias,
  parseAliases,
} from '@/lib/library/wiki-aliases'

describe('wiki aliases', () => {
  it('parses alias tags', () => {
    expect(parseAliases(['alias:SK', 'work', 'alias:Skratka'])).toEqual(['SK', 'Skratka'])
  })

  it('resolves by alias', () => {
    const docs: DocumentSummary[] = [
      {
        id: '1',
        title: 'Dlhy nazov dokumentu',
        folderId: null,
        filePath: null,
        tags: ['alias:dnd'],
        deletedAt: null,
        updatedAt: 1,
        isFavorite: false,
        isPinned: false,
      },
    ]
    expect(findDocumentByTitleOrAlias(docs, 'dnd')?.id).toBe('1')
    expect(addAliasTag(['work'], 'foo')).toEqual(['work', 'alias:foo'])
  })
})
