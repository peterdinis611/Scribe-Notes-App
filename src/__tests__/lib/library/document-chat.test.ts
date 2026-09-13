import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/tauri', () => ({
  invoke: vi.fn(),
}))

vi.mock('@/lib/db/nlp-api', () => ({
  nlpStatus: vi.fn(async () => ({ enabled: true, sidecarOk: true })),
  nlpDocumentAnalysis: vi.fn(async () => ({
    language: 'en',
    languageConfidence: 1,
    keywords: [{ term: 'note', score: 1, count: 2 }],
    keyphrases: ['local notes'],
    outline: [{ title: 'Intro', level: 1, kind: 'heading' }],
    summary: 'A short summary.',
    suggestedTitle: 'My Note',
    readabilityLabel: 'easy',
    readingTimeMinutes: 2,
    tone: 'neutral',
    dates: [{ text: 'tomorrow', kind: 'relative' }],
    wikiLinks: [],
    mentions: [],
    hosts: [],
  })),
  nlpDocumentTasks: vi.fn(async () => [
    { text: 'Buy milk', checked: false, source: 'checkbox', dueHint: null, documentId: 'd1', documentTitle: 'Doc' },
  ]),
  nlpSpellcheck: vi.fn(async () => ({
    language: 'en',
    checkedLanguage: 'en',
    issueCount: 0,
    issues: [],
    dictionarySize: 1,
  })),
  nlpSuggestWikiLinks: vi.fn(async () => []),
}))

import { invoke } from '@/lib/tauri'
import { askChat, runDocumentChatAction } from '@/lib/library/library-chat'

describe('document chat helpers', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
  })

  it('routes document scope to nlp_document_answer', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      answer: 'Based on this document: Hello',
      citations: [],
    })
    const result = await askChat('document', 'What is this about?', 'doc-1')
    expect(invoke).toHaveBeenCalledWith('nlp_document_answer', {
      documentId: 'doc-1',
      question: 'What is this about?',
      context: null,
    })
    expect(result.answer).toContain('document')
  })

  it('formats summarize action from analysis', async () => {
    const result = await runDocumentChatAction('doc-1', 'summarize')
    expect(result.answer).toContain('Summary')
    expect(result.answer).toContain('A short summary.')
  })

  it('formats open tasks action', async () => {
    const result = await runDocumentChatAction('doc-1', 'tasks')
    expect(result.answer).toContain('Buy milk')
  })
})
