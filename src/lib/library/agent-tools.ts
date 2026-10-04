import {
  getDocumentRevision,
  listDocumentRevisions,
} from '@/lib/db/api'
import {
  nlpAnalyzeRevisionDiff,
  nlpCalendarEvents,
  nlpCitationPack,
  nlpContradictionHints,
  nlpDetectPii,
  nlpExtractDecisions,
  nlpExtractQuotes,
  nlpFindDuplicates,
  nlpMeetingNotesPack,
  nlpOutlineQuiz,
  nlpRankTasks,
  nlpRewriteSelection,
  nlpSectionSummaries,
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

export async function runAgentSectionSummaries(documentId: string): Promise<LibraryChatResult> {
  const result = await nlpSectionSummaries({ documentId, limit: 12 })
  if (!result.sections.length) {
    return { answer: 'No section summaries produced for this note.', citations: [] }
  }
  return {
    answer: `**Section summaries**\n\n${result.sections
      .map((section) => `**${section.title}**\n${section.summary || '_empty_'}`)
      .join('\n\n')}`,
    citations: [
      {
        documentId,
        title: 'Section summaries',
        snippet: `${result.count} sections`,
      },
    ],
  }
}

export async function runAgentDecisions(documentId: string): Promise<LibraryChatResult> {
  const result = await nlpExtractDecisions({ documentId, limit: 12 })
  if (!result.decisions.length) {
    return { answer: 'No decisions detected in this note.', citations: [] }
  }
  return {
    answer: `**Decisions (${result.count})**\n\n${bullets(
      result.decisions.map((item) => item.text),
    )}`,
    citations: [{ documentId, title: 'Decisions', snippet: `${result.count} items · ${result.source}` }],
  }
}

export async function runAgentQuotes(documentId: string): Promise<LibraryChatResult> {
  const result = await nlpExtractQuotes({ documentId, limit: 10 })
  if (!result.quotes.length) {
    return { answer: 'No quotes detected in this note.', citations: [] }
  }
  return {
    answer: `**Quotes**\n\n${result.quotes.map((item) => `> ${item.text}`).join('\n\n')}`,
    citations: [{ documentId, title: 'Quotes', snippet: `${result.count} quotes` }],
  }
}

export async function runAgentPii(documentId: string): Promise<LibraryChatResult> {
  const result = await nlpDetectPii({ documentId, limit: 40 })
  if (!result.findings.length) {
    return {
      answer: `**Privacy scan**\n\nRisk: **${result.risk}** — no PII/secrets detected. Safe to share: ${
        result.safeToShare ? 'yes' : 'no'
      }.`,
      citations: [],
    }
  }
  return {
    answer: `**Privacy scan** (risk: **${result.risk}**)\n\n${bullets(
      result.findings.map((item) => `${item.label}: \`${item.match}\``),
    )}`,
    citations: [
      {
        documentId,
        title: 'PII scan',
        snippet: `${result.count} findings · ${result.source}`,
      },
    ],
  }
}

export async function runAgentRankTasks(documentId: string): Promise<LibraryChatResult> {
  const result = await nlpRankTasks({ documentId, limit: 16 })
  if (!result.tasks.length) {
    return { answer: 'No open tasks to rank in this note.', citations: [] }
  }
  return {
    answer: `**Ranked tasks**\n\n${bullets(
      result.tasks.map((task) => {
        const due = task.dueHint ? ` _(due ${task.dueHint})_` : ''
        return `(${task.score}) ${task.text}${due}`
      }),
    )}`,
    citations: [{ documentId, title: 'Ranked tasks', snippet: `${result.count} tasks` }],
  }
}

export async function runAgentContradictions(
  documentIdA: string,
  documentIdB: string,
): Promise<LibraryChatResult> {
  const result = await nlpContradictionHints({
    documentIdA,
    documentIdB,
    limit: 8,
  })
  if (!result.hints.length) {
    return { answer: 'No contradiction hints found between these notes.', citations: [] }
  }
  return {
    answer: `**Contradiction hints (${result.count})**\n\n${result.hints
      .map(
        (hint) =>
          `- A: ${hint.textA}\n  B: ${hint.textB}\n  _${(hint.reasons || []).join(', ')}_`,
      )
      .join('\n\n')}`,
    citations: [
      { documentId: documentIdA, title: 'Note A', snippet: 'Compared' },
      { documentId: documentIdB, title: 'Note B', snippet: 'Compared' },
    ],
  }
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
  selectionText?: string | null,
): Promise<LibraryChatResult> {
  const quoted =
    selectionText?.trim() ||
    goal.match(/[„"]([^„"]{12,800})[“"]/)?.[1]?.trim() ||
    goal.match(/"([^"]{12,800})"/)?.[1]?.trim() ||
    goal.match(/'([^']{12,800})'/)?.[1]?.trim()
  const source = quoted?.trim()
  if (!source) {
    return {
      answer:
        'Rewrite needs a text selection (from the editor bubble menu) or a quoted passage in the goal.',
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
