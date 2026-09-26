import {
  getDocumentRevision,
  listDocumentRevisions,
} from '@/lib/db/api'
import {
  nlpAnalyzeRevisionDiff,
  nlpCalendarEvents,
  nlpCitationPack,
  nlpFindDuplicates,
  nlpMeetingNotesPack,
  nlpOutlineQuiz,
  nlpRewriteSelection,
  nlpSuggestTags,
  type CalendarEvent,
} from '@/lib/db/nlp-api'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import type { LibraryChatCitation, LibraryChatResult } from '@/lib/library/library-chat'

function bullets(lines: string[]): string {
  return lines.map((line) => `- ${line}`).join('\n')
}

function weekRangeIso(): { fromDate: string; toDate: string } {
  const now = new Date()
  const day = now.getDay() || 7
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(now.getDate() - (day - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { fromDate: iso(monday), toDate: iso(sunday) }
}

function formatCalendar(events: CalendarEvent[]): LibraryChatResult {
  if (!events.length) {
    return { answer: 'No upcoming dates or deadlines found in the library this week.', citations: [] }
  }
  const lines = events.slice(0, 16).map((event) => {
    const when = event.resolvedDate || event.text
    const title = event.documentTitle ? ` — ${event.documentTitle}` : ''
    return `${when}: ${event.text}${title}`
  })
  const citations: LibraryChatCitation[] = []
  const seen = new Set<string>()
  for (const event of events) {
    if (!event.documentId || seen.has(event.documentId)) continue
    seen.add(event.documentId)
    citations.push({
      documentId: event.documentId,
      title: event.documentTitle || 'Note',
      snippet: event.text,
    })
    if (citations.length >= 8) break
  }
  return {
    answer: `**Deadlines this week**\n\n${bullets(lines)}`,
    citations,
  }
}

/** Library-wide deadlines (this week) via calendar batch. */
export async function runAgentDatesLibrary(): Promise<LibraryChatResult> {
  const range = weekRangeIso()
  const events = await nlpCalendarEvents({ limit: 24, ...range })
  return formatCalendar(events)
}

export async function runAgentMeetingPack(documentId: string): Promise<LibraryChatResult> {
  const pack = await nlpMeetingNotesPack({ documentId, limit: 12 })
  const sections: string[] = []
  if (pack.attendees.length) {
    sections.push(`**Attendees**\n\n${bullets(pack.attendees.slice(0, 12))}`)
  }
  if (pack.decisions.length) {
    sections.push(
      `**Decisions**\n\n${bullets(pack.decisions.slice(0, 10).map((item) => item.text))}`,
    )
  }
  if (pack.actionItems.length) {
    sections.push(
      `**Action items**\n\n${bullets(
        pack.actionItems.slice(0, 12).map((item) => {
          const due = item.dueHint ? ` _(due ${item.dueHint})_` : ''
          return `${item.text}${due}`
        }),
      )}`,
    )
  }
  if (!sections.length) {
    return {
      answer: 'No meeting decisions, action items, or attendees detected in this note.',
      citations: [],
    }
  }
  return {
    answer: sections.join('\n\n'),
    citations: [
      {
        documentId,
        title: 'Meeting pack',
        snippet: `${pack.counts.decisions} decisions · ${pack.counts.actionItems} actions`,
      },
    ],
  }
}

export async function runAgentOrganize(documentId: string): Promise<LibraryChatResult> {
  const tags = await nlpSuggestTags(documentId)
  const lines: string[] = []
  if (tags.folderSuggestion) {
    lines.push(`Suggested folder: **${tags.folderSuggestion}**`)
  }
  if (tags.tagSuggestions.length) {
    lines.push(`Suggested tags: ${tags.tagSuggestions.slice(0, 8).map((t) => `\`${t}\``).join(', ')}`)
  }
  if (tags.entities.length) {
    const entityLine = tags.entities
      .slice(0, 8)
      .map((entity) => entity.text)
      .filter(Boolean)
      .join(', ')
    if (entityLine) lines.push(`Entities: ${entityLine}`)
  }
  if (!lines.length) {
    return { answer: 'No folder or tag suggestions for this note yet.', citations: [] }
  }
  return {
    answer: `**Organize**\n\n${lines.join('\n\n')}`,
    citations: [
      {
        documentId,
        title: 'Organize',
        snippet: tags.folderSuggestion || tags.tagSuggestions[0] || '',
      },
    ],
  }
}

export async function runAgentDuplicates(): Promise<LibraryChatResult> {
  const result = await nlpFindDuplicates(16)
  if (!result.pairs.length) {
    return { answer: 'No near-duplicate notes found in the library.', citations: [] }
  }
  const lines = result.pairs.slice(0, 10).map((pair) => {
    const pct = Math.round(pair.score * 100)
    return `**${pair.leftTitle}** ↔ **${pair.rightTitle}** (${pct}% similar)`
  })
  const citations: LibraryChatCitation[] = []
  for (const pair of result.pairs.slice(0, 6)) {
    citations.push({
      documentId: pair.leftId,
      title: pair.leftTitle,
      snippet: `Similar to ${pair.rightTitle}`,
    })
  }
  return {
    answer: `**Possible duplicates** (compared ${result.compared} notes)\n\n${bullets(lines)}`,
    citations,
  }
}

export async function runAgentCitations(claim: string): Promise<LibraryChatResult> {
  const trimmed = claim.trim() || 'key claims in my notes'
  const pack = await nlpCitationPack({ claim: trimmed, limit: 8 })
  if (!pack.citations.length && !pack.bullets.length) {
    return { answer: 'No supporting citations found in the library for that claim.', citations: [] }
  }
  const lines =
    pack.bullets.length > 0
      ? pack.bullets.slice(0, 10)
      : pack.citations.slice(0, 8).map((item) => `**${item.title}**: ${item.snippet}`)
  return {
    answer: `**Citations for:** ${pack.claim}\n\n${bullets(lines)}`,
    citations: pack.citations.map((item) => ({
      documentId: item.documentId,
      title: item.title,
      snippet: item.snippet,
    })),
  }
}

export async function runAgentOutlineQuiz(documentId: string): Promise<LibraryChatResult> {
  const quiz = await nlpOutlineQuiz({ documentId, limit: 8 })
  if (!quiz.questions.length) {
    return { answer: 'Not enough outline structure to build a quiz yet.', citations: [] }
  }
  const lines = quiz.questions.slice(0, 8).map((item, index) => {
    const answer = item.answer ? `\n  → ${item.answer}` : ''
    const section = item.section ? ` _( ${item.section})_` : ''
    return `**Q${index + 1}.** ${item.question}${section}${answer}`
  })
  return {
    answer: `**Outline quiz**\n\n${lines.join('\n\n')}`,
    citations: [{ documentId, title: 'Outline quiz', snippet: `${quiz.count} questions` }],
  }
}

export async function runAgentRevision(documentId: string): Promise<LibraryChatResult> {
  const revisions = await listDocumentRevisions(documentId, 4)
  if (revisions.length < 1) {
    return {
      answer: 'No saved revisions yet — save a named revision to compare changes.',
      citations: [],
    }
  }
  const newest = revisions[0]
  const older = revisions[1]
  if (!older) {
    return {
      answer: `Only one revision (“${newest.label || newest.title || 'latest'}”). Need at least two to summarize a diff.`,
      citations: [],
    }
  }
  const [oldDetail, newDetail] = await Promise.all([
    getDocumentRevision(older.id),
    getDocumentRevision(newest.id),
  ])
  const oldText = tiptapToPlainText(oldDetail.contentJson).slice(0, 40_000)
  const newText = tiptapToPlainText(newDetail.contentJson).slice(0, 40_000)
  if (!oldText.trim() || !newText.trim()) {
    return { answer: 'Could not load revision plaintext for comparison.', citations: [] }
  }
  const report = await nlpAnalyzeRevisionDiff({
    oldText,
    newText,
    maxBullets: 8,
  })
  const lines = [
    report.headline || report.summary,
    ...report.bullets.slice(0, 8).map((item) => item.text),
  ].filter(Boolean)
  return {
    answer: `**Revision diff** (${older.label || 'older'} → ${newest.label || 'newer'})\n\n${bullets(lines)}`,
    citations: [{ documentId, title: newest.label || 'Revision', snippet: report.summary }],
  }
}

export async function runAgentRewrite(
  documentId: string,
  goal: string,
): Promise<LibraryChatResult> {
  const quoted =
    goal.match(/[„"]([^„"]{12,800})[“"]/) ||
    goal.match(/"([^"]{12,800})"/) ||
    goal.match(/'([^']{12,800})'/)
  const source = quoted?.[1]?.trim()
  if (!source) {
    return {
      answer:
        'Rewrite needs a quoted passage in the goal (e.g. rewrite “…” clearer), or use the selection AI menu for live editor spans.',
      citations: [],
    }
  }
  const mode = /short|stru[cč]n/i.test(goal)
    ? 'shorten'
    : /formal|form[aá]ln/i.test(goal)
      ? 'formal'
      : 'clarity'
  const result = await nlpRewriteSelection(source, mode, goal.slice(0, 200))
  return {
    answer: `**Rewrite** (_${result.mode}_)\n\n${result.output}`,
    citations: [{ documentId, title: 'Rewrite', snippet: result.original.slice(0, 120) }],
  }
}
