import { describe, expect, it } from 'vitest'
import {
  buildDocumentAskActions,
  buildDocumentAskQuestions,
} from '@/lib/library/document-ask-suggestions'
import type { DocumentTask, NlpDocumentAnalysis } from '@/lib/db/nlp-api'

const baseAnalysis = (overrides: Partial<NlpDocumentAnalysis> = {}): NlpDocumentAnalysis => ({
  language: 'en',
  languageConfidence: 0.9,
  keywords: [{ term: 'release', score: 0.8, count: 3 }],
  keyphrases: ['beta launch'],
  outline: [{ title: 'Timeline', level: 2, kind: 'heading' }],
  mentions: ['@Ada'],
  dates: [{ text: 'Friday', kind: 'date', resolvedDate: '2026-09-25' }],
  ...overrides,
})

describe('document-ask-suggestions', () => {
  it('builds different questions from note signals', () => {
    const tasks: DocumentTask[] = [
      {
        text: 'Ship beta docs',
        checked: false,
        source: 'checkbox',
        dueHint: null,
        documentId: 'd1',
        documentTitle: 'Launch',
      },
    ]
    const questions = buildDocumentAskQuestions(baseAnalysis(), tasks, {
      title: 'Product launch',
      slovak: false,
    })
    expect(questions.some((item) => item.includes('Product launch'))).toBe(true)
    expect(questions.some((item) => item.includes('Timeline'))).toBe(true)
    expect(questions.some((item) => item.includes('Ada'))).toBe(true)
    expect(questions.some((item) => item.includes('Ship beta'))).toBe(true)
  })

  it('ranks actions by document signals', () => {
    const tasks: DocumentTask[] = [
      {
        text: 'Open item',
        checked: false,
        source: 'checkbox',
        dueHint: null,
        documentId: 'd1',
        documentTitle: 'Note',
      },
    ]
    const actions = buildDocumentAskActions(baseAnalysis(), tasks)
    expect(actions[0]).toBe('summarize')
    expect(actions).toContain('tasks')
    expect(actions).toContain('dates')
    expect(actions.indexOf('tasks')).toBeLessThan(actions.indexOf('tone'))
  })
})
