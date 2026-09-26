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
  nlpExtractFlashcards: vi.fn(async () => ({
    cards: [{ kind: 'qa', question: 'What is Scribe?', answer: 'A notes app', front: 'What is Scribe?' }],
    count: 1,
    source: 'python',
  })),
  nlpExtractTakeaways: vi.fn(async () => ({
    summary: 'Ship local AI features.',
    takeaways: [{ text: 'Ship flashcards this week', kind: 'sentence', score: 2 }],
    count: 1,
    themes: [{ term: 'flashcards', count: 2 }],
    source: 'python',
  })),
  nlpCheckTerminology: vi.fn(async () => ({
    issues: [],
    issueCount: 0,
    scannedTerms: 3,
    source: 'python',
  })),
  nlpWritingCoach: vi.fn(async () => ({
    language: 'en',
    score: 100,
    hints: [{ code: 'ok', severity: 'info', message: 'No major style issues found.', excerpt: '' }],
    stats: {},
    source: 'python',
  })),
}))

import { invoke } from '@/lib/tauri'
import {
  askChat,
  documentChatContext,
  matchDocumentChatIntent,
  runDocumentChatAction,
} from '@/lib/library/library-chat'

describe('document chat helpers', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
  })

  it('routes document scope to nlp_document_answer', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        answer: 'Based on this document: Hello',
        citations: [],
      })
    const result = await askChat('document', 'What feels unfinished here?', 'doc-1')
    expect(invoke).toHaveBeenCalledWith('match_document_chat_intent', {
      question: 'What feels unfinished here?',
    })
    expect(invoke).toHaveBeenCalledWith('nlp_document_answer', {
      documentId: 'doc-1',
      question: 'What feels unfinished here?',
      context: null,
    })
    expect(result.answer).toContain('document')
  })

  it('routes clear document intents to structured actions', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('tasks')
    const result = await askChat('document', 'What are the open tasks?', 'doc-1')
    expect(invoke).toHaveBeenCalledWith('match_document_chat_intent', {
      question: 'What are the open tasks?',
    })
    expect(result.answer).toContain('Buy milk')
  })

  it('matches SK/EN free-form intents', () => {
    expect(matchDocumentChatIntent('Summarize this note')).toBe('summarize')
    expect(matchDocumentChatIntent('Aké dátumy sú v poznámke?')).toBe('dates')
    expect(matchDocumentChatIntent('Who is mentioned in this note?')).toBe('mentions')
    expect(matchDocumentChatIntent('How does this note connect to others?')).toBe('similar')
    expect(matchDocumentChatIntent('Make flashcards from this')).toBe('flashcards')
    expect(matchDocumentChatIntent('What are the key takeaways?')).toBe('takeaways')
    expect(matchDocumentChatIntent('Check terminology consistency')).toBe('terminology')
    expect(matchDocumentChatIntent('Writing coach tips please')).toBe('style')
    expect(matchDocumentChatIntent('What feels unfinished or unclear here?')).toBeNull()
    expect(matchDocumentChatIntent('What is this note mainly about?')).toBeNull()
    expect(matchDocumentChatIntent('Explain the key terms in this note')).toBeNull()
  })

  it('formats summarize action from analysis', async () => {
    const result = await runDocumentChatAction('doc-1', 'summarize')
    expect(result.answer).toContain('Summary')
    expect(result.answer).toContain('A short summary.')
  })

  it('formats flashcards and takeaways', async () => {
    const cards = await runDocumentChatAction('doc-1', 'flashcards')
    expect(cards.answer).toContain('What is Scribe?')
    const takeaways = await runDocumentChatAction('doc-1', 'takeaways')
    expect(takeaways.answer).toContain('Ship flashcards')
    const style = await runDocumentChatAction('doc-1', 'style')
    expect(style.answer).toContain('no style issues')
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
