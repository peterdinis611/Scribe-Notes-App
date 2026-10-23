/**
 * Lightweight note “database” properties encoded in tags:
 *   status:doing | project:Acme | due:2026-10-20 | priority:high
 * Free-form tags without a colon stay as labels only.
 */

export type NotePropertyKey = 'status' | 'project' | 'due' | 'priority'

export type NoteProperties = {
  status?: string
  project?: string
  due?: string
  priority?: string
  labels: string[]
}

const PROP_KEYS = new Set<NotePropertyKey>(['status', 'project', 'due', 'priority'])

export function parseNoteProperties(tags: string[] | null | undefined): NoteProperties {
  const result: NoteProperties = { labels: [] }
  for (const raw of tags ?? []) {
    const tag = raw.trim()
    if (!tag) continue
    const sep = tag.indexOf(':')
    if (sep <= 0) {
      result.labels.push(tag)
      continue
    }
    const key = tag.slice(0, sep).trim().toLowerCase() as NotePropertyKey
    const value = tag.slice(sep + 1).trim()
    if (!value || !PROP_KEYS.has(key)) {
      result.labels.push(tag)
      continue
    }
    result[key] = value
  }
  return result
}

export function serializeNoteProperties(props: NoteProperties): string[] {
  const out: string[] = []
  for (const key of PROP_KEYS) {
    const value = props[key]?.trim()
    if (value) out.push(`${key}:${value}`)
  }
  for (const label of props.labels) {
    const trimmed = label.trim()
    if (trimmed) out.push(trimmed)
  }
  return out
}

export function setNoteProperty(
  tags: string[] | null | undefined,
  key: NotePropertyKey,
  value: string | null,
): string[] {
  const props = parseNoteProperties(tags)
  if (value == null || !value.trim()) {
    delete props[key]
  } else {
    props[key] = value.trim()
  }
  return serializeNoteProperties(props)
}

export const NOTE_STATUS_OPTIONS = ['inbox', 'doing', 'blocked', 'done'] as const
export const NOTE_PRIORITY_OPTIONS = ['low', 'medium', 'high'] as const
