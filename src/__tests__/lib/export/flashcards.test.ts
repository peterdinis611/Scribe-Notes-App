import { describe, expect, it } from 'vitest'
import {
  flashcardsToAnkiTsv,
  flashcardsToAnkiTsvLocal,
  flashcardsToMarkdown,
  flashcardsToMarkdownLocal,
} from '@/lib/export/flashcards'
import type { Flashcard } from '@/lib/db/nlp-api'

const sample: Flashcard[] = [
  { kind: 'qa', question: 'What is Scribe?', answer: 'A local notes app', front: 'What is Scribe?' },
  { kind: 'definition', question: 'What is MCP?', answer: 'Model Context Protocol' },
]

describe('flashcards export', () => {
  it('formats Anki TSV', () => {
    const tsv = flashcardsToAnkiTsvLocal(sample)
    expect(tsv).toContain('What is Scribe?\tA local notes app')
    expect(tsv).toContain('What is MCP?\tModel Context Protocol')
  })

  it('formats Markdown', () => {
    const md = flashcardsToMarkdownLocal(sample, 'Study')
    expect(md).toContain('# Study')
    expect(md).toContain('## 1. What is Scribe?')
    expect(md).toContain('A local notes app')
  })

  it('async entry falls back to local outside Tauri', async () => {
    const tsv = await flashcardsToAnkiTsv(sample)
    const md = await flashcardsToMarkdown(sample, 'Study')
    expect(tsv).toContain('What is Scribe?')
    expect(md).toContain('# Study')
  })
})
