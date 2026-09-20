import { describe, expect, it } from 'vitest'
import { findWikiGhostMatch } from '@/lib/editor/wiki-ghost'
import { citationSearchQuery } from '@/lib/editor/citation-jump'

describe('findWikiGhostMatch', () => {
  it('picks the longest title already typed as plain text', () => {
    const match = findWikiGhostMatch('See the design notes for Q3.', [
      { id: 'a', title: 'Notes', phrase: 'Notes' },
      { id: 'b', title: 'Design notes', phrase: 'design notes' },
    ])
    expect(match?.id).toBe('b')
    expect(match?.start).toBeGreaterThanOrEqual(0)
  })

  it('skips mid-word matches', () => {
    expect(
      findWikiGhostMatch('This denotes a change.', [
        { id: 'n', title: 'Notes', phrase: 'notes' },
      ]),
    ).toBeNull()
  })

  it('skips text that is already a wiki token', () => {
    expect(
      findWikiGhostMatch('Open [[Design notes]] later', [
        { id: 'b', title: 'Design notes', phrase: 'Design notes' },
      ]),
    ).toBeNull()
  })
})

describe('citationSearchQuery', () => {
  it('keeps short snippets intact', () => {
    expect(citationSearchQuery('  the thesis is X  ')).toBe('the thesis is X')
  })

  it('trims long snippets on a word boundary', () => {
    const long = 'alpha '.repeat(30)
    const query = citationSearchQuery(long)
    expect(query.length).toBeLessThanOrEqual(72)
    expect(query.endsWith(' ')).toBe(false)
  })
})
