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
  nlpSimilarDocuments: vi.fn(async () => [
    { documentId: 'd2', title: 'Related note', snippet: 'Also about notes', rank: 1 },
  ]),
}))

import { invoke } from '@/lib/tauri'
import { askChat, documentChatContext, runDocumentChatAction } from '@/lib/library/library-chat'

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

  it('keeps the last 16 turns for document memory', () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      text: `turn-${index}`,
    }))
    const context = documentChatContext(messages)
    expect(context).toHaveLength(16)
    expect(context[0]?.text).toBe('turn-4')
    expect(context.at(-1)?.text).toBe('turn-19')
  })

  it('suggests follow-up questions from outline and keywords', async () => {
    const result = await runDocumentChatAction('doc-1', 'questions')
    expect(result.followups?.length).toBeGreaterThan(0)
    expect(result.answer).toContain('Intro')
  })

  it('lists similar notes', async () => {
    const result = await runDocumentChatAction('doc-1', 'similar')
    expect(result.answer).toContain('Related note')
    expect(result.citations[0]?.documentId).toBe('d2')
  })
})
