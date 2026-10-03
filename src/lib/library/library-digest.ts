import { listDocuments } from '@/lib/db/api'
import { nlpListOpenTasks } from '@/lib/db/nlp-api'
import { runAgentDatesLibrary } from '@/lib/library/agent-tools'
import type { LibraryChatResult } from '@/lib/library/library-chat'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

export type LibraryDigestPeriod = 'day' | 'week'

function bullets(lines: string[]): string {
  return lines.map((line) => `- ${line}`).join('\n')
}

/** Library-wide digest: recent notes, open tasks, and deadlines. */
export async function runLibraryDigest(
  period: LibraryDigestPeriod = 'day',
): Promise<LibraryChatResult> {
  const windowMs = period === 'day' ? DAY_MS : WEEK_MS
  const since = Date.now() - windowMs
  const label = period === 'day' ? 'Daily digest' : 'Weekly digest'

  const docs = (await listDocuments())
    .filter((doc) => doc.deletedAt == null && doc.updatedAt >= since)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 16)

  const [tasks, dates] = await Promise.all([
    nlpListOpenTasks(36).catch(() => []),
    runAgentDatesLibrary().catch(() => null),
  ])

  const sections: string[] = [`**${label}**`]

  if (docs.length) {
    sections.push(
      `**Updated notes (${docs.length})**\n\n${bullets(
        docs.map((doc) => doc.title?.trim() || 'Untitled'),
      )}`,
    )
  } else {
    sections.push(
      period === 'day'
        ? '**Updated notes**\n\nNothing changed in the last 24 hours.'
        : '**Updated notes**\n\nNothing changed in the last 7 days.',
    )
  }

  if (tasks.length) {
    sections.push(
      `**Open tasks (${tasks.length})**\n\n${bullets(
        tasks.slice(0, 16).map((task) => {
          const due = task.dueHint ? ` _(due ${task.dueHint})_` : ''
          const where = task.documentTitle ? ` — ${task.documentTitle}` : ''
          return `${task.text}${due}${where}`
        }),
      )}`,
    )
  } else {
    sections.push('**Open tasks**\n\nNo open checklist tasks in the library.')
  }

  if (dates?.answer) {
    sections.push(dates.answer)
  }

  const citations = [
    ...docs.slice(0, 8).map((doc) => ({
      documentId: doc.id,
      title: doc.title || 'Untitled',
      snippet: period === 'day' ? 'Updated today' : 'Updated this week',
    })),
    ...(dates?.citations ?? []),
  ].slice(0, 12)

  return {
    answer: sections.join('\n\n'),
    citations,
    followups: [
      'What themes show up across my notes?',
      'Which notes still look unfinished?',
      period === 'day' ? 'Run a weekly review' : 'What deadlines are coming up?',
    ],
  }
}
