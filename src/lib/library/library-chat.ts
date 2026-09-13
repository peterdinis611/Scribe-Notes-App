import { invoke } from '@/lib/tauri'
import {
  nlpDocumentAnalysis,
  nlpDocumentTasks,
  nlpSpellcheck,
  nlpStatus,
  nlpSuggestWikiLinks,
} from '@/lib/db/nlp-api'

export type LibraryChatCitation = {
  documentId: string
  title: string
  snippet: string
}

export type LibraryChatResult = {
  answer: string
  citations: LibraryChatCitation[]
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
    limit: 6,
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
    return askDocument(documentId ?? '', question, context)
  }
  return askLibrary(question)
}

function bullets(lines: string[]): string {
  return lines.map((line) => `• ${line}`).join('\n')
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

  const analysis = await nlpDocumentAnalysis(documentId)
  if (!analysis) {
    throw new Error('libraryChat.analysisFailed')
  }

  const citation: LibraryChatCitation = {
    documentId,
    title: analysis.suggestedTitle || 'Document',
    snippet: analysis.summary?.slice(0, 200) || '',
  }

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
    default:
      return { answer: 'Unknown action.', citations: [] }
  }
}
