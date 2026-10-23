import type { DocumentSummary } from '@/lib/db/api'
import { parseNoteProperties } from '@/lib/library/document-properties'
import { groupTasksByAgenda } from '@/lib/library/task-agenda'
import type { DocumentTask } from '@/lib/db/nlp-api'

export type LiveQueryKind =
  | { kind: 'agenda' }
  | { kind: 'project'; project: string }
  | { kind: 'status'; status: string }
  | { kind: 'due'; due: string }

/** Parse `query:agenda` / `query:project:Acme` / `query:status:doing` / `query:due:2026-10-23`. */
export function parseLiveQuery(raw: string): LiveQueryKind | null {
  const trimmed = raw.trim()
  if (!/^query:/i.test(trimmed)) return null
  const rest = trimmed.replace(/^query:/i, '').trim()
  if (!rest) return null
  if (rest.toLowerCase() === 'agenda') return { kind: 'agenda' }
  const sep = rest.indexOf(':')
  if (sep <= 0) return null
  const key = rest.slice(0, sep).trim().toLowerCase()
  const value = rest.slice(sep + 1).trim()
  if (!value) return null
  if (key === 'project') return { kind: 'project', project: value }
  if (key === 'status') return { kind: 'status', status: value }
  if (key === 'due') return { kind: 'due', due: value }
  return null
}

export function filterDocumentsByLiveQuery(
  documents: DocumentSummary[],
  query: LiveQueryKind,
): DocumentSummary[] {
  if (query.kind === 'agenda') return []
  return documents
    .filter((doc) => !doc.deletedAt)
    .filter((doc) => {
      const props = parseNoteProperties(doc.tags)
      if (query.kind === 'project') return (props.project ?? '').toLowerCase() === query.project.toLowerCase()
      if (query.kind === 'status') return (props.status ?? '').toLowerCase() === query.status.toLowerCase()
      if (query.kind === 'due') return props.due === query.due
      return false
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 24)
}

export function formatAgendaEmbedLines(tasks: DocumentTask[], now = Date.now()): string[] {
  const buckets = groupTasksByAgenda(tasks, now)
  const lines: string[] = []
  for (const bucket of buckets) {
    lines.push(`${bucket.id} (${bucket.items.length})`)
    for (const task of bucket.items.slice(0, 8)) {
      const due = task.dueHint ? ` · ${task.dueHint}` : ''
      lines.push(`• ${task.text}${due}`)
    }
  }
  return lines.slice(0, 40)
}
