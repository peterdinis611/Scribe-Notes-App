import { save } from '@tauri-apps/plugin-dialog'
import { buildIcsCalendarNative, writeTextFile } from '@/lib/db/api'
import type { CalendarEvent } from '@/lib/db/nlp-api'
import { isTauriRuntime } from '@/lib/tauri'

export type IcsEventInput = {
  summary: string
  /** YYYY-MM-DD preferred; also accepts ISO datetime. */
  date: string
  description?: string
  uid?: string
}

function sanitizeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim()
  return `${cleaned || 'scribe-calendar'}.ics`
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

function foldLine(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = []
  let rest = line
  chunks.push(rest.slice(0, 75))
  rest = rest.slice(75)
  while (rest.length > 0) {
    chunks.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }
  return chunks.join('\r\n')
}

function toDateValue(raw: string): { allDay: boolean; value: string } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const day = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)
  if (day) {
    return { allDay: true, value: day[1]!.replace(/-/g, '') }
  }
  const iso = Date.parse(trimmed)
  if (Number.isNaN(iso)) return null
  const d = new Date(iso)
  const stamp = d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
  return { allDay: false, value: stamp }
}

function stampNow(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}

/** Sync JS fallback — used by vitest and when Tauri IPC is unavailable. */
export function buildIcsCalendarLocal(events: IcsEventInput[], calendarName = 'Scribe'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Scribe//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ]
  const now = stampNow()
  events.forEach((event, index) => {
    const parsed = toDateValue(event.date)
    if (!parsed) return
    const summary = (event.summary || 'Untitled').trim().slice(0, 200)
    const uid =
      event.uid?.trim() ||
      `scribe-${now}-${index}@local`
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${now}`)
    if (parsed.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${parsed.value}`)
    } else {
      lines.push(`DTSTART:${parsed.value}`)
    }
    lines.push(`SUMMARY:${escapeIcsText(summary)}`)
    if (event.description?.trim()) {
      lines.push(`DESCRIPTION:${escapeIcsText(event.description.trim().slice(0, 500))}`)
    }
    lines.push('END:VEVENT')
  })
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/** Prefer Rust `scribe-ui` when running under Tauri; otherwise JS fallback. */
export async function buildIcsCalendar(
  events: IcsEventInput[],
  calendarName = 'Scribe',
): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await buildIcsCalendarNative(events, calendarName)
    } catch {
      // Fall through to local builder.
    }
  }
  return buildIcsCalendarLocal(events, calendarName)
}

export function calendarEventsToIcs(events: CalendarEvent[]): IcsEventInput[] {
  return events
    .filter((item) => item.resolvedDate)
    .map((item, index) => ({
      summary: item.text.trim().slice(0, 200) || item.documentTitle || 'Event',
      date: item.resolvedDate!,
      description: [item.documentTitle, item.kind].filter(Boolean).join(' · ') || undefined,
      uid: `scribe-cal-${item.documentId || 'lib'}-${index}@local`,
    }))
}

/** Pull due dates from agent markdown like `_(due 2026-10-12)_` or `due 12 Oct`. */
export function parseDueHintsFromMarkdown(markdown: string): IcsEventInput[] {
  const events: IcsEventInput[] = []
  const seen = new Set<string>()
  const lines = (markdown || '').split(/\n/)
  for (const line of lines) {
    const dueIso = line.match(/due\s+(\d{4}-\d{2}-\d{2})/i)
    const dueHint = line.match(/_\(due\s+([^)]+)\)_/i) || line.match(/due\s+([^\s*_]+(?:\s+[^\s*_]+)?)/i)
    const dateRaw = dueIso?.[1] || dueHint?.[1]
    if (!dateRaw) continue
    const summary = line
      .replace(/^\s*[-*•\d.)]+\s*/, '')
      .replace(/_\(due[^)]*\)_/gi, '')
      .replace(/due\s+\d{4}-\d{2}-\d{2}/gi, '')
      .replace(/\*\*/g, '')
      .trim()
      .slice(0, 160)
    const key = `${dateRaw}|${summary}`
    if (seen.has(key) || !summary) continue
    seen.add(key)
    events.push({ summary, date: dateRaw.trim(), description: 'From Scribe agent' })
  }
  return events
}

export async function exportIcsFile(args: {
  events: IcsEventInput[]
  baseName?: string
  calendarName?: string
  dialogTitle?: string
}): Promise<string | null> {
  if (!args.events.length) return null
  const path = await save({
    title: args.dialogTitle ?? 'Export calendar',
    defaultPath: sanitizeFileName(args.baseName ?? 'scribe-calendar'),
    filters: [{ name: 'iCalendar', extensions: ['ics'] }],
  })
  if (!path) return null
  await writeTextFile(path, await buildIcsCalendar(args.events, args.calendarName ?? 'Scribe'))
  return path
}
