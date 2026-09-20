import { describe, expect, it } from 'vitest'
import { documentQuestionHistory } from '@/lib/library/document-question-history'

describe('documentQuestionHistory', () => {
  it('pairs user questions with the following assistant answer', () => {
    const turns = documentQuestionHistory([
      { id: 'u1', role: 'user', text: ' What is the thesis? ', createdAt: 10 },
      { id: 'a1', role: 'assistant', text: 'The thesis is X.', createdAt: 11 },
      { id: 'u2', role: 'user', text: 'Who is cited?', createdAt: 12, action: null },
    ])

    expect(turns).toEqual([
      {
        id: 'u1',
        question: 'What is the thesis?',
        answer: 'The thesis is X.',
        action: null,
        createdAt: 10,
      },
      {
        id: 'u2',
        question: 'Who is cited?',
        answer: undefined,
        action: null,
        createdAt: 12,
      },
    ])
  })

  it('skips blank user turns and keeps action chips', () => {
    const turns = documentQuestionHistory([
      { id: 'skip', role: 'user', text: '   ' },
      { id: 'chip', role: 'user', text: 'Summarize', action: 'summarize', createdAt: 3 },
      { id: 'reply', role: 'assistant', text: 'Short summary.' },
    ])

    expect(turns).toHaveLength(1)
    expect(turns[0]?.action).toBe('summarize')
    expect(turns[0]?.answer).toBe('Short summary.')
  })
})
