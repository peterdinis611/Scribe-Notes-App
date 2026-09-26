import { describe, expect, it } from 'vitest'
import {
  flashcardsToAnkiTsv,
  flashcardsToMarkdown,
} from '@/lib/export/flashcards'
import type { Flashcard } from '@/lib/db/nlp-api'

const sample: Flashcard[] = [
  { kind: 'qa', question: 'What is Scribe?', answer: 'A local notes app', front: 'What is Scribe?' },
  { kind: 'definition', question: 'What is MCP?', answer: 'Model Context Protocol' },
]

describe('flashcards export', () => {
  it('formats Anki TSV', () => {
    const tsv = flashcardsToAnkiTsv(sample)
    expect(tsv).toContain('What is Scribe?\tA local notes app')
    expect(tsv).toContain('What is MCP?\tModel Context Protocol')
  })

  it('formats Markdown', () => {
    const md = flashcardsToMarkdown(sample, 'Study')
    expect(md).toContain('# Study')
    expect(md).toContain('## 1. What is Scribe?')
    expect(md).toContain('A local notes app')
  })
})
