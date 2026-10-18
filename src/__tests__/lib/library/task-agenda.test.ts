import { describe, expect, it } from 'vitest'
import { agendaBucketForDue, groupTasksByAgenda } from '@/lib/library/task-agenda'
import type { DocumentTask } from '@/lib/db/nlp-api'

function task(text: string, dueHint: string | null): DocumentTask {
  return {
    text,
    checked: false,
    source: 'checkbox',
    dueHint,
    documentId: 'doc-1',
    documentTitle: 'Note',
  }
}

describe('task agenda', () => {
  it('classifies due hints relative to today', () => {
    const now = new Date(2026, 9, 18, 12, 0, 0).getTime()
    expect(agendaBucketForDue('2026-10-17', now)).toBe('overdue')
    expect(agendaBucketForDue('2026-10-18', now)).toBe('today')
    expect(agendaBucketForDue('2026-10-20', now)).toBe('upcoming')
    expect(agendaBucketForDue('2026-12-01', now)).toBe('later')
    expect(agendaBucketForDue(null, now)).toBe('later')
  })

  it('groups tasks into agenda buckets', () => {
    const now = new Date(2026, 9, 18, 12, 0, 0).getTime()
    const buckets = groupTasksByAgenda(
      [task('A', '2026-10-17'), task('B', '2026-10-18'), task('C', null)],
      now,
    )
    expect(buckets.map((b) => b.id)).toEqual(['overdue', 'today', 'later'])
  })
})
