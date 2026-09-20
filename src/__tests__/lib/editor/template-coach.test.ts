import { describe, expect, it } from 'vitest'
import { expectedSectionsForTemplate, templateCoachFromJson } from '@/lib/editor/template-coach'

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

const reportPartial = JSON.stringify({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Zhrnutie' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Revenue grew 12% with stronger retention in Q2.' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Úvod' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Stručné zhrnutie kľúčových zistení a odporúčaní pre čitateľa.' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hlavná časť' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Survey of 240 customers showed clear preference for local search.' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Záver' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Zhrnutie a ďalšie kroky.' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Kontrola pred odovzdaním' }] },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Zhrnutie má kľúčové zistenia' }] }],
        },
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Úvod definuje cieľ' }] }],
        },
      ],
    },
  ],
})

describe('templateCoachFromJson', () => {
  it('treats meeting placeholders as empty', () => {
    expect(templateCoachFromJson(meetingEmpty)).toEqual({
      present: 0,
      expected: 4,
      templateId: 'meeting-sk',
      missingHeadings: ['Účastníci', 'Agenda', 'Poznámky', 'Úlohy'],
      openChecklist: [],
    })
  })

  it('counts filled meeting sections', () => {
    expect(templateCoachFromJson(meetingFilled)).toEqual({
      present: 3,
      expected: 4,
      templateId: 'meeting-sk',
      missingHeadings: ['Úlohy'],
      openChecklist: [],
    })
  })

  it('tracks report headings and open checklist items', () => {
    const result = templateCoachFromJson(reportPartial)
    expect(result?.templateId).toBe('report-sk')
    expect(result?.missingHeadings).toEqual(['Úvod', 'Záver'])
    expect(result?.openChecklist).toEqual(['Úvod definuje cieľ'])
    expect(result?.present).toBe(3) // 2 filled headings + 1 checked task
    expect(result?.expected).toBe(6) // 4 headings + 2 checklist items
  })

  it('ignores notes without template headings', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Loose thoughts' }] }],
    })
    expect(templateCoachFromJson(json)).toBeNull()
  })

  it('exposes expected sections for NLP hints', () => {
    expect(expectedSectionsForTemplate('report-sk')).toEqual([
      'Zhrnutie',
      'Úvod',
      'Hlavná časť',
      'Záver',
    ])
  })
})
