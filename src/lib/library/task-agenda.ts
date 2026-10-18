import type { DocumentTask } from '@/lib/db/nlp-api'

export type AgendaBucketId = 'overdue' | 'today' | 'upcoming' | 'later'

export type AgendaBucket = {
  id: AgendaBucketId
  items: DocumentTask[]
}

function startOfLocalDay(ms = Date.now()): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function parseDueHintMs(dueHint: string | null | undefined): number | null {
  if (!dueHint) return null
  const match = dueHint.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function agendaBucketForDue(dueHint: string | null | undefined, now = Date.now()): AgendaBucketId {
  if (!dueHint) return 'later'
  const match = dueHint.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return 'later'
  const dueLocal = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
  const today = startOfLocalDay(now)
  const tomorrow = today + 24 * 60 * 60 * 1000
  if (dueLocal < today) return 'overdue'
  if (dueLocal < tomorrow) return 'today'
  if (dueLocal < today + 7 * 24 * 60 * 60 * 1000) return 'upcoming'
  return 'later'
}

export function groupTasksByAgenda(tasks: DocumentTask[], now = Date.now()): AgendaBucket[] {
  const buckets: Record<AgendaBucketId, DocumentTask[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    later: [],
  }
  for (const task of tasks) {
    buckets[agendaBucketForDue(task.dueHint, now)].push(task)
  }
  const order: AgendaBucketId[] = ['overdue', 'today', 'upcoming', 'later']
  return order
    .map((id) => ({
      id,
      items: [...buckets[id]].sort((a, b) => {
        const aDue = parseDueHintMs(a.dueHint) ?? Number.POSITIVE_INFINITY
        const bDue = parseDueHintMs(b.dueHint) ?? Number.POSITIVE_INFINITY
        if (aDue !== bDue) return aDue - bDue
        return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' })
      }),
    }))
    .filter((bucket) => bucket.items.length > 0)
}
