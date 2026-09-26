import type { DocumentTask, NlpDocumentAnalysis } from '@/lib/db/nlp-api'
import type { DocumentChatAction } from '@/lib/library/library-chat'

const MAX_QUESTIONS = 6
const MAX_ACTIONS = 8

function uniqueKeepOrder(items: string[], limit: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const item = raw.trim().replace(/\s+/g, ' ')
    if (item.length < 2) continue
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

function clip(text: string, max = 56): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

/**
 * Build ask-chips from this note’s analysis so every document gets different
 * questions (headings, people, dates, tasks) instead of the same static list.
 */
export function buildDocumentAskQuestions(
  analysis: NlpDocumentAnalysis | null | undefined,
  tasks: DocumentTask[] | null | undefined,
  opts?: { title?: string | null; slovak?: boolean },
): string[] {
  const slovak = Boolean(opts?.slovak)
  const title = opts?.title?.trim()
  const questions: string[] = []

  if (title && title.length >= 2 && !/^untitled$/i.test(title)) {
    questions.push(
      slovak
        ? `O čom je poznámka „${clip(title)}“?`
        : `What is “${clip(title)}” mainly about?`,
    )
  }

  const headings = uniqueKeepOrder(
    (analysis?.outline ?? []).map((item) => item.title),
    4,
  )
  for (const heading of headings) {
    questions.push(
      slovak
        ? `Čo hovorí táto poznámka v časti „${clip(heading)}“?`
        : `What does this note say in “${clip(heading)}”?`,
    )
  }

  const phrases = uniqueKeepOrder(
    [...(analysis?.keyphrases ?? []), ...(analysis?.keywords ?? []).map((item) => item.term)],
    4,
  )
  for (const phrase of phrases) {
    if (headings.some((heading) => heading.toLowerCase() === phrase.toLowerCase())) continue
    questions.push(
      slovak
        ? `Čo hovorí táto poznámka o „${clip(phrase)}“?`
        : `What does this note say about “${clip(phrase)}”?`,
    )
  }

  const people = uniqueKeepOrder(analysis?.mentions ?? [], 3)
  for (const person of people) {
    const label = person.replace(/^@/, '')
    questions.push(
      slovak ? `Čo je tu o ${clip(label)}?` : `What does this note say about ${clip(label)}?`,
    )
  }

  const dates = uniqueKeepOrder(
    (analysis?.dates ?? []).map((item) => item.resolvedDate || item.text),
    2,
  )
  for (const date of dates) {
    questions.push(
      slovak ? `Čo sa viaže k dátumu ${clip(date)}?` : `What is tied to ${clip(date)}?`,
    )
  }

  const openTasks = uniqueKeepOrder(
    (tasks ?? []).filter((task) => !task.checked).map((task) => task.text),
    2,
  )
  for (const task of openTasks) {
    questions.push(
      slovak
        ? `Aký je stav úlohy „${clip(task)}“?`
        : `What’s the status of “${clip(task)}”?`,
    )
  }

  if (questions.length < 3) {
    questions.push(
      slovak
        ? 'Čo by som mal urobiť ďalej podľa tejto poznámky?'
        : 'What should I do next based on this note?',
    )
    questions.push(
      slovak
        ? 'Aké rozhodnutia alebo závery sú v tejto poznámke?'
        : 'What decisions or conclusions are in this note?',
    )
  }

  return uniqueKeepOrder(questions, MAX_QUESTIONS)
}

/** Prefer actions that match signals present in this note. */
export function buildDocumentAskActions(
  analysis: NlpDocumentAnalysis | null | undefined,
  tasks: DocumentTask[] | null | undefined,
): DocumentChatAction[] {
  const openTasks = (tasks ?? []).filter((task) => !task.checked)
  const ranked: Array<{ action: DocumentChatAction; score: number }> = [
    { action: 'summarize', score: 100 },
    { action: 'questions', score: 95 },
    { action: 'outline', score: (analysis?.outline?.length ?? 0) > 0 ? 90 : 40 },
    { action: 'quotes', score: (analysis?.keyphrases?.length ?? 0) > 0 ? 85 : 35 },
    { action: 'keywords', score: (analysis?.keywords?.length ?? 0) > 0 ? 80 : 30 },
    { action: 'tasks', score: openTasks.length > 0 ? 88 : 20 },
    { action: 'dates', score: (analysis?.dates?.length ?? 0) > 0 ? 82 : 18 },
    {
      action: 'mentions',
      score:
        (analysis?.mentions?.length ?? 0) +
          (analysis?.wikiLinks?.length ?? 0) +
          (analysis?.hosts?.length ?? 0) >
        0
          ? 78
          : 15,
    },
    { action: 'wiki', score: (analysis?.wikiLinks?.length ?? 0) > 0 ? 70 : 25 },
    { action: 'similar', score: 55 },
    { action: 'tone', score: 50 },
  ]

  ranked.sort((a, b) => b.score - a.score)
  return ranked.slice(0, MAX_ACTIONS).map((item) => item.action)
}
