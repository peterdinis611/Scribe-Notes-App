import { describe, expect, it } from 'vitest'
import {
  documentMatchesMetaFilters,
  groupTags,
  makeMetaTag,
  parseTag,
} from '@/lib/library/tag-meta'

describe('tag-meta', () => {
  it('parses structured tags', () => {
    expect(parseTag('status:draft')).toEqual({
      raw: 'status:draft',
      kind: 'status',
      value: 'draft',
    })
    expect(parseTag('plain')).toEqual({ raw: 'plain', kind: 'plain', value: 'plain' })
  })

  it('groups tags by kind', () => {
    const groups = groupTags(['status:done', 'project:Acme', 'notes', 'year:2026'])
    expect(groups.status).toHaveLength(1)
    expect(groups.project[0]?.value).toBe('Acme')
    expect(groups.year[0]?.value).toBe('2026')
    expect(groups.plain[0]?.value).toBe('notes')
  })

  it('matches meta filters', () => {
    const tags = [makeMetaTag('status', 'draft'), makeMetaTag('project', 'Scribe')]
    expect(
      documentMatchesMetaFilters(tags, { status: 'draft', project: null, year: null }),
    ).toBe(true)
    expect(
      documentMatchesMetaFilters(tags, { status: 'done', project: null, year: null }),
    ).toBe(false)
  })
})
