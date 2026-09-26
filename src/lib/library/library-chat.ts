import { invoke } from '@/lib/tauri'
import { invokeMatchDocumentChatIntent } from '@/lib/db/api'
import {
  nlpCheckTerminology,
  nlpDocumentAnalysis,
  nlpDocumentTasks,
  nlpExtractFlashcards,
  nlpExtractTakeaways,
  nlpSimilarDocuments,
  nlpSpellcheck,
  nlpStatus,
  nlpSuggestWikiLinks,
  nlpWritingCoach,
} from '@/lib/db/nlp-api'

export type LibraryChatCitation = {
  documentId: string
  title: string
  snippet: string
  chunkIndex?: number | null
}

export type LibraryChatResult = {
  answer: string
  citations: LibraryChatCitation[]
  followups?: string[]
}

export type ChatScope = 'library' | 'document'

export type DocumentChatAction =
  | 'summarize'
  | 'outline'
  | 'keywords'
  | 'tasks'
  | 'title'
  | 'wiki'
  | 'spellcheck'
  | 'dates'
  | 'tone'
  | 'similar'
  | 'mentions'
  | 'quotes'
  | 'questions'
  | 'flashcards'
  | 'takeaways'
  | 'terminology'
  | 'style'

export const DOCUMENT_CHAT_CONTEXT_LIMIT = 16

export function documentChatContext(
  messages: Array<{ role: 'user' | 'assistant'; text: string }>,
): Array<{ role: string; text: string }> {
  return messages.slice(-DOCUMENT_CHAT_CONTEXT_LIMIT).map((item) => ({
    role: item.role,
    text: item.text.length > 1200 ? `${item.text.slice(0, 1199)}…` : item.text,
  }))
}

async function assertNlpReady() {
  const status = await nlpStatus()
  if (!status.enabled) {
    throw new Error('libraryChat.nlpDisabled')
  }
  if (!status.sidecarOk) {
    throw new Error('libraryChat.sidecarUnavailable')
  }
}

/** Extractive Q&A over the whole library (no cloud LLM). */
export async function askLibrary(question: string): Promise<LibraryChatResult> {
  const trimmed = question.trim()
  if (!trimmed) {
    throw new Error('libraryChat.emptyQuestion')
  }
  await assertNlpReady()
  return invoke<LibraryChatResult>('nlp_library_answer', {
    question: trimmed,
    limit: 8,
  })
}

/** Extractive Q&A scoped to one open document (optional prior chat memory). */
export async function askDocument(
  documentId: string,
  question: string,
  context?: Array<{ role: string; text: string }>,
): Promise<LibraryChatResult> {
  const trimmed = question.trim()
  if (!trimmed) {
    throw new Error('libraryChat.emptyQuestion')
  }
  if (!documentId) {
    throw new Error('libraryChat.noActiveDocument')
  }
  await assertNlpReady()
  return invoke<LibraryChatResult>('nlp_document_answer', {
    documentId,
    question: trimmed,
    context: context?.length ? context : null,
  })
}

export async function askChat(
  scope: ChatScope,
  question: string,
  documentId?: string | null,
  context?: Array<{ role: string; text: string }>,
): Promise<LibraryChatResult> {
  if (scope === 'document') {
    let action: DocumentChatAction | null = null
    try {
      action = (await invokeMatchDocumentChatIntent(question)) as DocumentChatAction | null
    } catch {
      action = matchDocumentChatIntent(question)
    }
    if (action && documentId) {
      return runDocumentChatAction(documentId, action)
    }
    return askDocument(documentId ?? '', question, context)
  }
  return askLibrary(question)
}

/** @deprecated Prefer Rust `match_document_chat_intent` — kept for sync tests only. */
export function matchDocumentChatIntent(question: string): DocumentChatAction | null {
  const folded = question
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (!folded) return null

  // Thin sync mirror of scribe-core::match_document_chat_intent for vitest without Tauri.
  const rules: Array<{ action: DocumentChatAction; needles: string[] }> = [
    { action: 'summarize', needles: ['summarize', 'summary', 'tlldr', 'digest', 'zhrn', 'zhrnutie', 'strucne'] },
    { action: 'outline', needles: ['outline', 'structure', 'heading', 'osnova', 'struktura', 'nadpisy'] },
    { action: 'keywords', needles: ['keyword', 'key word', 'klucove slova'] },
    {
      action: 'tasks',
      needles: ['task', 'todo', 'to-do', 'action item', 'checklist', 'what should i do next', 'ulohy', 'otvorene ulohy'],
    },
    { action: 'dates', needles: ['date', 'deadline', 'due date', 'schedule', 'datumy', 'terminy'] },
    {
      action: 'mentions',
      needles: ['who is mentioned', 'people mentioned', 'mention', 'kto je', 'ludia', 'spomenut', 'zmienky'],
    },
    { action: 'wiki', needles: ['wiki link', 'wikilink', 'backlink', 'wiki odkazy', 'prepojen'] },
    {
      action: 'similar',
      needles: [
        'related note',
        'similar note',
        'connected note',
        'how does this note connect',
        'how does this connect',
        'suvisiace',
        'podobne poznamky',
      ],
    },
    { action: 'quotes', needles: ['key claim', 'main claim', 'klucove tvrden', 'hlavne tvrden'] },
    { action: 'tone', needles: ['tone', 'readability', 'reading time', 'ton', 'citanie', 'citatelnost'] },
    { action: 'spellcheck', needles: ['spellcheck', 'spelling', 'typo', 'pravopis', 'preklepy'] },
    { action: 'title', needles: ['suggest title', 'suggested title', 'better title', 'navrhni nazov', 'navrhnut nazov'] },
    {
      action: 'questions',
      needles: ['ask next', 'follow-up question', 'follow up question', 'what else should i ask', 'dalsie otazky'],
    },
    { action: 'flashcards', needles: ['flashcard', 'study card', 'quiz me', 'karticky', 'kartick', 'kviz'] },
    {
      action: 'takeaways',
      needles: ['takeaway', 'key point', 'executive summary', 'action item', 'zavery', 'hlavne body', 'zhrnutie rozhodnut'],
    },
    {
      action: 'terminology',
      needles: ['terminology', 'term consistency', 'inconsistent term', 'terminologia', 'konzistencia pojmov', 'nekonzistent'],
    },
    {
      action: 'style',
      needles: [
        'writing coach',
        'style tip',
        'clarity',
        'passive voice',
        'filler word',
        'styl',
        'jasnost',
        'trpny rod',
        'vyplnove',
      ],
    },
  ]

  for (const rule of rules) {
    if (rule.needles.some((needle) => folded.includes(needle))) {
      return rule.action
    }
  }
  return null
}

function bullets(lines: string[]): string {
  return lines.map((line) => `• ${line}`).join('\n')
}

function uniqueStrings(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = value?.trim()
    if (!trimmed) continue
    const key = trimmed.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
    if (out.length >= limit) break
  }
  return out
}

/** Structured Local AI actions for the active document (extractive / heuristic). */
export async function runDocumentChatAction(
  documentId: string,
  action: DocumentChatAction,
): Promise<LibraryChatResult> {
  if (!documentId) {
    throw new Error('libraryChat.noActiveDocument')
  }
  await assertNlpReady()

  if (action === 'spellcheck') {
    const result = await nlpSpellcheck(documentId)
    if (result.issueCount === 0) {
      return {
        answer: 'Spellcheck: no issues found in this document.',
        citations: [],
      }
    }
    const lines = result.issues.slice(0, 12).map((issue) => {
      const suggestions = issue.suggestions.slice(0, 3).join(', ')
      return suggestions
        ? `**${issue.word}** → ${suggestions}`
        : `**${issue.word}**`
    })
    return {
      answer: `Spellcheck found **${result.issueCount}** issue(s):\n${bullets(lines)}`,
      citations: [],
    }
  }

  if (action === 'wiki') {
    const suggestions = await nlpSuggestWikiLinks(documentId, 8)
    if (suggestions.length === 0) {
      return {
        answer: 'No wiki-link suggestions for this document yet.',
        citations: [],
      }
    }
    return {
      answer: `Suggested wiki links:\n${bullets(
        suggestions.map(
          (item) => `[[${item.title}]] — “${item.phrase}” (${item.reason})`,
        ),
      )}`,
      citations: suggestions.map((item) => ({
        documentId: item.documentId,
        title: item.title,
        snippet: item.phrase,
      })),
    }
  }

  if (action === 'tasks') {
    const tasks = await nlpDocumentTasks(documentId)
    const open = tasks.filter((task) => !task.checked)
    if (open.length === 0) {
      return {
        answer: tasks.length
          ? 'All checklist tasks in this document are done.'
          : 'No open tasks found in this document.',
        citations: [],
      }
    }
    return {
      answer: `Open tasks (${open.length}):\n${bullets(
        open.map((task) => {
          const due = task.dueHint ? ` _(due ${task.dueHint})_` : ''
          return `${task.text}${due}`
        }),
      )}`,
      citations: [],
    }
  }

  if (action === 'similar') {
    const hits = await nlpSimilarDocuments(documentId, 8)
    if (hits.length === 0) {
      return {
        answer: 'No related notes found yet. Index the library in Settings → Local AI.',
        citations: [],
      }
    }
    return {
      answer: `**Related notes**\n\n${bullets(hits.map((hit) => hit.title || 'Untitled'))}`,
      citations: hits.map((hit) => ({
        documentId: hit.documentId,
        title: hit.title,
        snippet: hit.snippet,
      })),
    }
  }

  if (action === 'flashcards') {
    const result = await nlpExtractFlashcards({ documentId, limit: 10 })
    if (!result.cards.length) {
      return {
        answer: 'No flashcards could be extracted from this document yet.',
        citations: [],
      }
    }
    return {
      answer: `**Flashcards (${result.count})**\n\n${bullets(
        result.cards.map(
          (card) => `**Q:** ${card.question}\n  **A:** ${card.answer}`,
        ),
      )}`,
      citations: [],
    }
  }

  if (action === 'takeaways') {
    const result = await nlpExtractTakeaways({ documentId, limit: 8 })
    if (!result.takeaways.length) {
      return {
        answer: 'No takeaways found in this document.',
        citations: [],
      }
    }
    const themes = result.themes?.length
      ? `\n\n**Themes:** ${result.themes
          .slice(0, 6)
          .map((item) => item.term)
          .join(', ')}`
      : ''
    const summary = result.summary?.trim() ? `**Summary**\n\n${result.summary}\n\n` : ''
    return {
      answer: `${summary}**Takeaways**\n\n${bullets(
        result.takeaways.map((item) => item.text),
      )}${themes}`,
      citations: [],
    }
  }

  if (action === 'terminology') {
    const result = await nlpCheckTerminology({ documentId, limit: 10 })
    if (!result.issues.length) {
      return {
        answer: 'Terminology looks consistent in this document.',
        citations: [],
      }
    }
    return {
      answer: `**Terminology issues (${result.issueCount})**\n\n${bullets(
        result.issues.map((issue) => {
          const variants = issue.variants
            .map((item) => `“${item.term}”×${item.count}`)
            .join(', ')
          return `Prefer **${issue.canonical}** — also saw ${variants}`
        }),
      )}`,
      citations: [],
    }
  }

  if (action === 'style') {
    const result = await nlpWritingCoach({ documentId, limit: 10 })
    const actionable = result.hints.filter((hint) => hint.code !== 'ok')
    if (!actionable.length) {
      return {
        answer: 'Writing coach: no style issues flagged.',
        citations: [],
      }
    }
    return {
      answer: `**Writing coach** (${actionable.length})\n\n${bullets(
        actionable.map((hint) => {
          const excerpt = hint.excerpt ? ` — “${hint.excerpt}”` : ''
          return `${hint.message}${excerpt}`
        }),
      )}`,
      citations: [],
    }
  }

  const analysis = await nlpDocumentAnalysis(documentId)
  if (!analysis) {
    throw new Error('libraryChat.analysisFailed')
  }

  const citation: LibraryChatCitation = {
    documentId,
    title: analysis.suggestedTitle || 'Document',
    snippet: analysis.summary?.slice(0, 200) || '',
  }
  const slovak = analysis.language === 'sk'

  switch (action) {
    case 'summarize': {
      const summary = analysis.summary?.trim()
      const phrases = analysis.keyphrases?.length
        ? `\n\n${bullets(analysis.keyphrases.slice(0, 6))}`
        : ''
      return {
        answer: summary
          ? `**Summary**\n\n${summary}${phrases}`
          : 'No summary available for this document yet.',
        citations: summary ? [citation] : [],
      }
    }
    case 'outline': {
      if (!analysis.outline.length) {
        return { answer: 'No outline headings found.', citations: [] }
      }
      return {
        answer: `**Outline**\n\n${bullets(
          analysis.outline.map((item) => {
            const indent = '  '.repeat(Math.max(0, item.level - 1))
            return `${indent}${item.title}`
          }),
        )}`,
        citations: [citation],
      }
    }
    case 'keywords': {
      if (!analysis.keywords.length) {
        return { answer: 'No keywords extracted.', citations: [] }
      }
      return {
        answer: `**Keywords**\n\n${bullets(
          analysis.keywords.slice(0, 12).map((item) => item.term),
        )}`,
        citations: [citation],
      }
    }
    case 'title': {
      const title = analysis.suggestedTitle?.trim()
      return {
        answer: title
          ? `Suggested title: **${title}**`
          : 'Could not suggest a title for this document.',
        citations: title ? [citation] : [],
      }
    }
    case 'dates': {
      const dates = analysis.dates ?? []
      if (!dates.length) {
        return { answer: 'No dates detected in this document.', citations: [] }
      }
      return {
        answer: `**Dates**\n\n${bullets(
          dates.slice(0, 12).map((item) => `${item.text}${item.kind ? ` (${item.kind})` : ''}`),
        )}`,
        citations: [citation],
      }
    }
    case 'tone': {
      const tone = analysis.tone || 'unknown'
      const readability = analysis.readabilityLabel || '—'
      const minutes = Math.max(1, Math.round(analysis.readingTimeMinutes ?? 1))
      return {
        answer: [
          `**Tone:** ${tone}`,
          `**Readability:** ${readability}`,
          `**Reading time:** ~${minutes} min`,
          analysis.language ? `**Language:** ${analysis.language}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        citations: [citation],
      }
    }
    case 'mentions': {
      const people = analysis.mentions ?? []
      const wiki = analysis.wikiLinks ?? []
      const hosts = analysis.hosts ?? []
      if (!people.length && !wiki.length && !hosts.length) {
        return {
          answer: 'No people, wiki links, or sites detected in this document.',
          citations: [],
        }
      }
      const lines = [
        ...people.map((item) => `@${item.replace(/^@/, '')}`),
        ...wiki.map((item) => `[[${item}]]`),
        ...hosts,
      ]
      return {
        answer: `**People & links**\n\n${bullets(lines.slice(0, 16))}`,
        citations: [citation],
      }
    }
    case 'quotes': {
      const phrases = uniqueStrings(analysis.keyphrases ?? [], 8)
      if (!phrases.length) {
        return { answer: 'No key claims extracted from this document yet.', citations: [] }
      }
      return {
        answer: `**Key claims**\n\n${bullets(phrases.map((item) => `“${item}”`))}`,
        citations: [citation],
      }
    }
    case 'questions': {
      const topics = uniqueStrings(
        [
          ...(analysis.outline ?? []).map((item) => item.title),
          ...(analysis.keyphrases ?? []),
          ...(analysis.keywords ?? []).map((item) => item.term),
        ],
        6,
      )
      if (!topics.length) {
        return { answer: 'Not enough signal to suggest follow-up questions.', citations: [] }
      }
      const lines = topics.map((topic) =>
        slovak
          ? `Čo hovorí táto poznámka o „${topic}“?`
          : `What does this note say about “${topic}”?`,
      )
      return {
        answer: `**${slovak ? 'Ďalšie otázky' : 'Suggested questions'}**\n\n${bullets(lines)}`,
        citations: [citation],
        followups: lines,
      }
    }
    default:
      return { answer: 'Unknown action.', citations: [] }
  }
}
