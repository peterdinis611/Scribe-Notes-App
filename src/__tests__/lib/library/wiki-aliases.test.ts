import { describe, expect, it } from 'vitest'
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
    const docs = [
      {
        id: '1',
        title: 'Dlhy nazov dokumentu',
        tags: ['alias:dnd'],
        deletedAt: null,
        updatedAt: 1,
      },
    ] as any
    expect(findDocumentByTitleOrAlias(docs, 'dnd')?.id).toBe('1')
    expect(addAliasTag(['work'], 'foo')).toEqual(['work', 'alias:foo'])
  })
})
