import { describe, expect, it } from 'vitest'
import { Node } from '@tiptap/pm/model'
import { Schema } from '@tiptap/pm/model'
import { buildSearchRegExp, findMatches } from '@/lib/editor/search-extension'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
  },
})

function docFromText(text: string) {
  return schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])])
}

function docFromParagraphs(paragraphs: string[]) {
  return schema.node(
    'doc',
    null,
    paragraphs.map((text) => schema.node('paragraph', null, text ? [schema.text(text)] : [])),
  )
}

describe('search-extension matching', () => {
  it('finds plain substring matches', () => {
    const doc = docFromText('alpha beta alpha')
    const { matches, regexError } = findMatches(doc, 'alpha', {
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    })
    expect(regexError).toBeNull()
    expect(matches).toHaveLength(2)
    expect(matches[0]).toEqual({ from: 1, to: 6 })
  })

  it('supports whole-word matching', () => {
    const doc = docFromText('cat catalog cat')
    const { matches } = findMatches(doc, 'cat', {
      caseSensitive: false,
      wholeWord: true,
      regex: false,
    })
    expect(matches).toHaveLength(2)
  })

  it('supports regex matching and capture-friendly patterns', () => {
    const doc = docFromText('foo123 bar456')
    const { matches, regexError } = findMatches(doc, 'foo(\\d+)', {
      caseSensitive: false,
      wholeWord: false,
      regex: true,
    })
    expect(regexError).toBeNull()
    expect(matches).toHaveLength(1)
    expect(matches[0]).toEqual({ from: 1, to: 7 })
  })

  it('returns an error for invalid regex', () => {
    const doc = docFromText('test')
    const { matches, regexError } = findMatches(doc, '(unclosed', {
      caseSensitive: false,
      wholeWord: false,
      regex: true,
    })
    expect(matches).toHaveLength(0)
    expect(regexError).toBeTruthy()
  })

  it('builds case-insensitive plain search safely', () => {
    const { pattern, error } = buildSearchRegExp('a+b', {
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    })
    expect(error).toBeNull()
    expect(pattern?.test('a+b')).toBe(true)
    expect(pattern?.test('ab')).toBe(false)
  })

  it('supports fuzzy matching for approximate terms', () => {
    const doc = docFromText('The quick brown fox')
    const { matches, regexError } = findMatches(doc, 'qick brwn', {
      caseSensitive: false,
      wholeWord: false,
      regex: false,
      fuzzy: true,
    })
    expect(regexError).toBeNull()
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0]!.from).toBeGreaterThanOrEqual(1)
  })

  it('fuzzy mode skips regex validation errors', () => {
    const doc = docFromText('regular expression practice')
    const { matches, regexError } = findMatches(doc, '(unclosed', {
      caseSensitive: false,
      wholeWord: false,
      regex: true,
      fuzzy: true,
    })
    expect(regexError).toBeNull()
    // Fuse may not score raw regex punctuation highly — just ensure it does not crash.
    expect(Array.isArray(matches)).toBe(true)
  })

  it('finds fuzzy matches across multiple paragraphs', () => {
    const doc = docFromParagraphs(['First paragraph here', 'Second paragaph with typo', 'Third'])
    const { matches } = findMatches(doc, 'paragaph', {
      caseSensitive: false,
      wholeWord: false,
      regex: false,
      fuzzy: true,
    })
    expect(matches.length).toBeGreaterThan(0)
  })

  it('returns no matches for empty search term', () => {
    const doc = docFromText('anything')
    expect(
      findMatches(doc, '', {
        caseSensitive: false,
        wholeWord: false,
        regex: false,
        fuzzy: true,
      }).matches,
    ).toEqual([])
  })
})

void Node
