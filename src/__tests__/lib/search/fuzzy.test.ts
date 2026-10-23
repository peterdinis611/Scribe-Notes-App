import { describe, expect, it } from 'vitest'
import {
  findFuzzyTextMatches,
  foldDiacritics,
  fuzzyFilter,
  normalizeForFuzzy,
  structuralScore,
  tokenScore,
} from '@/lib/search/fuzzy'

describe('normalizeForFuzzy', () => {
  it('folds Slovak diacritics', () => {
    expect(foldDiacritics('Správa')).toBe('Sprava')
    expect(normalizeForFuzzy('Správa používateľov')).toBe('sprava pouzivatelov')
    expect(normalizeForFuzzy('Kôň')).toBe('kon')
  })
})

describe('structural scoring', () => {
  it('scores exact / prefix / substring', () => {
    expect(tokenScore('sprava', 'sprava')).toBe(100)
    expect(tokenScore('sprava pouzivatelov', 'sprava')).toBeGreaterThan(90)
    expect(tokenScore('moja sprava', 'sprava')).toBeGreaterThan(70)
  })

  it('requires all query tokens (AND)', () => {
    expect(structuralScore('Weekly project roadmap', 'week road')).toBeGreaterThan(70)
    expect(structuralScore('Weekly digest', 'week road')).toBe(0)
  })
})

describe('fuzzyFilter', () => {
  const items = [
    { id: '1', title: 'Meeting notes', hint: 'agenda' },
    { id: '2', title: 'Weekly digest', hint: 'summary' },
    { id: '3', title: 'Project roadmap', hint: 'milestones' },
    { id: '4', title: 'Denník', hint: 'journal' },
    { id: '5', title: 'Správa používateľov', hint: 'admin' },
  ]

  it('returns all items for empty query', () => {
    expect(fuzzyFilter(items, '', (item) => item.title)).toEqual(items)
  })

  it('ranks approximate title matches', () => {
    const hits = fuzzyFilter(items, 'meetng', (item) => item.title)
    expect(hits[0]?.id).toBe('1')
  })

  it('matches secondary haystack fields', () => {
    const hits = fuzzyFilter(items, 'milestne', (item) => [item.title, item.hint])
    expect(hits[0]?.id).toBe('3')
  })

  it('matches close Slovak spellings', () => {
    const hits = fuzzyFilter(items, 'dennk', (item) => item.title)
    expect(hits.map((item) => item.id)).toContain('4')
  })

  it('matches queries without diacritics to accented titles', () => {
    const hits = fuzzyFilter(items, 'sprava', (item) => item.title)
    expect(hits[0]?.id).toBe('5')
  })

  it('ranks multi-token queries with AND semantics', () => {
    const hits = fuzzyFilter(
      [
        { id: 'a', title: 'Weekly project roadmap' },
        { id: 'b', title: 'Weekly digest' },
      ],
      'week road',
      (item) => item.title,
    )
    expect(hits[0]?.id).toBe('a')
    expect(hits.map((item) => item.id)).not.toContain('b')
  })

  it('respects limit', () => {
    const hits = fuzzyFilter(items, 'e', (item) => item.title, { limit: 1 })
    expect(hits).toHaveLength(1)
  })

  it('returns empty for empty source list', () => {
    expect(fuzzyFilter([], 'note', (item: { title: string }) => item.title)).toEqual([])
  })
})

describe('findFuzzyTextMatches', () => {
  it('returns ranges for approximate substring matches', () => {
    const matches = findFuzzyTextMatches(
      [{ text: 'The quick brown fox jumps', from: 10 }],
      'qick brwn',
    )
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0]!.from).toBeGreaterThanOrEqual(10)
    expect(matches[0]!.to).toBeGreaterThan(matches[0]!.from)
  })

  it('matches without diacritics against accented text', () => {
    const matches = findFuzzyTextMatches([{ text: 'Správa používateľov', from: 0 }], 'sprava')
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0]!.from).toBe(0)
  })

  it('returns empty for blank term', () => {
    expect(findFuzzyTextMatches([{ text: 'hello', from: 1 }], '   ')).toEqual([])
  })

  it('returns empty for empty chunks', () => {
    expect(findFuzzyTextMatches([], 'hello')).toEqual([])
  })

  it('merges overlapping match ranges', () => {
    const matches = findFuzzyTextMatches(
      [
        { text: 'alphabet alphabet', from: 0 },
        { text: 'alphabet soup', from: 40 },
      ],
      'alphabt',
    )
    expect(matches.length).toBeGreaterThan(0)
    for (let i = 1; i < matches.length; i += 1) {
      expect(matches[i]!.from).toBeGreaterThanOrEqual(matches[i - 1]!.to)
    }
  })

  it('respects case-sensitive mode', () => {
    const insensitive = findFuzzyTextMatches([{ text: 'Alpha BETA gamma', from: 5 }], 'beta', {
      caseSensitive: false,
    })
    const sensitive = findFuzzyTextMatches([{ text: 'Alpha BETA gamma', from: 5 }], 'beta', {
      caseSensitive: true,
    })
    expect(insensitive.length).toBeGreaterThan(0)
    expect(sensitive.length).toBeLessThanOrEqual(insensitive.length)
  })
})
