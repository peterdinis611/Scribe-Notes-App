import { describe, expect, it } from 'vitest'
import {
  generateLoremIpsum,
  normalizeLoremOptions,
} from '@/lib/editor/lorem-ipsum'

describe('generateLoremIpsum', () => {
  it('starts with classic lead-in when enabled', () => {
    const text = generateLoremIpsum({ unit: 'words', count: 5, startWithLorem: true })
    expect(text.startsWith('Lorem ipsum dolor sit amet')).toBe(true)
  })

  it('generates the requested number of paragraphs', () => {
    const text = generateLoremIpsum({ unit: 'paragraphs', count: 3, startWithLorem: true })
    const paragraphs = text.split(/\n\n+/).filter(Boolean)
    expect(paragraphs).toHaveLength(3)
  })

  it('generates the requested number of sentences', () => {
    const text = generateLoremIpsum({ unit: 'sentences', count: 4, startWithLorem: false })
    const sentences = text.match(/[.!?]/g) ?? []
    expect(sentences.length).toBe(4)
  })

  it('clamps invalid counts', () => {
    expect(normalizeLoremOptions({ unit: 'paragraphs', count: 0 }).count).toBe(1)
    expect(normalizeLoremOptions({ unit: 'words', count: 999 }).count).toBe(200)
  })
})
