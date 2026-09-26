import { describe, expect, it } from 'vitest'
import { formatWikiLinkRenderText, parseWikiLinkRaw } from '@/lib/editor/wiki-link'

describe('parseWikiLinkRaw', () => {
  it('parses title only', () => {
    expect(parseWikiLinkRaw('Project plan')).toEqual({
      title: 'Project plan',
      heading: null,
      alias: null,
      displayLabel: 'Project plan',
    })
  })

  it('parses heading and alias', () => {
    expect(parseWikiLinkRaw('Note#Section|Alias')).toEqual({
      title: 'Note',
      heading: 'Section',
      alias: 'Alias',
      displayLabel: 'Alias',
    })
  })
})

describe('formatWikiLinkRenderText', () => {
  it('round-trips heading and alias', () => {
    expect(
      formatWikiLinkRenderText({ label: 'Alias', linkTitle: 'Note', heading: 'Section' }),
    ).toBe('[[Note#Section|Alias]]')
  })
})
