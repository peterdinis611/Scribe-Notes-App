import { describe, expect, it } from 'vitest'
import { templateCoachFromJson } from '@/lib/editor/template-coach'

const meetingEmpty = JSON.stringify({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Zápisnica zo stretnutia' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Účastníci' }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Meno 1' }] }] }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Agenda' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Bod 1' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Poznámky' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Záznam diskusie a rozhodnutí.' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Úlohy' }] },
    { type: 'paragraph' },
  ],
})

const meetingFilled = JSON.stringify({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Účastníci' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Ana, Boris, Cyril' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Agenda' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Roadmap Q3 and hiring' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Poznámky' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Agreed to freeze scope until Friday.' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Úlohy' }] },
    { type: 'paragraph' },
  ],
})

describe('templateCoachFromJson', () => {
  it('treats meeting placeholders as empty', () => {
    expect(templateCoachFromJson(meetingEmpty)).toEqual({
      present: 0,
      expected: 4,
      templateId: 'meeting-sk',
    })
  })

  it('counts filled meeting sections', () => {
    expect(templateCoachFromJson(meetingFilled)).toEqual({
      present: 3,
      expected: 4,
      templateId: 'meeting-sk',
    })
  })

  it('ignores notes without template headings', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Loose thoughts' }] }],
    })
    expect(templateCoachFromJson(json)).toBeNull()
  })
})
