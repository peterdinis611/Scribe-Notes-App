import { describe, expect, it } from 'vitest'
import {
  buildIcsCalendar,
  buildIcsCalendarLocal,
  calendarEventsToIcs,
  parseDueHintsFromMarkdown,
} from '@/lib/export/ics'

describe('ics export', () => {
  it('builds VCALENDAR with all-day events', () => {
    const body = buildIcsCalendarLocal([
      { summary: 'Ship notes', date: '2026-10-12', description: 'From Scribe' },
    ])
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).toContain('DTSTART;VALUE=DATE:20261012')
    expect(body).toContain('SUMMARY:Ship notes')
    expect(body).toContain('END:VCALENDAR')
  })

  it('async entry falls back to local outside Tauri', async () => {
    const body = await buildIcsCalendar([
      { summary: 'Ship notes', date: '2026-10-12' },
    ])
    expect(body).toContain('DTSTART;VALUE=DATE:20261012')
  })

  it('maps calendar events and parses due hints from markdown', () => {
    const mapped = calendarEventsToIcs([
      {
        documentId: 'd1',
        documentTitle: 'Plan',
        text: 'Launch',
        kind: 'deadline',
        resolvedDate: '2026-11-01',
      },
    ])
    expect(mapped[0]?.date).toBe('2026-11-01')

    const parsed = parseDueHintsFromMarkdown('- Finish deck _(due 2026-10-20)_\n- Skip me')
    expect(parsed.some((item) => item.date.includes('2026-10-20'))).toBe(true)
  })
})
