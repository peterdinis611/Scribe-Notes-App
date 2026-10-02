import type { DocumentTask, NlpDocumentAnalysis } from '@/lib/db/nlp-api'
import { buildDocumentAskQuestions } from '@/lib/library/document-ask-suggestions'
import type { AgentToolId } from '@/lib/library/agent-prefs'

const MAX_CHIPS = 12
const MAX_TOOLS = 8

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

function clip(text: string, max = 48): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

/** Multi-step / grounded goal chips for the Agent panel (document scope). */
export function buildAgentGoalChips(
  analysis: NlpDocumentAnalysis | null | undefined,
  tasks: DocumentTask[] | null | undefined,
  opts?: { title?: string | null; slovak?: boolean },
): string[] {
  const slovak = Boolean(opts?.slovak)
  const title = opts?.title?.trim()
  const chips: string[] = []
  const openTasks = (tasks ?? []).filter((task) => !task.checked)
  const headings = uniqueKeepOrder((analysis?.outline ?? []).map((item) => item.title), 4)
  const phrases = uniqueKeepOrder(
    [...(analysis?.keyphrases ?? []), ...(analysis?.keywords ?? []).map((item) => item.term)],
    4,
  )
  const people = uniqueKeepOrder(analysis?.mentions ?? [], 3).map((item) => item.replace(/^@/, ''))
  const dates = uniqueKeepOrder(
    (analysis?.dates ?? []).map((item) => item.resolvedDate || item.text),
    3,
  )
  const wiki = uniqueKeepOrder(analysis?.wikiLinks ?? [], 2)

  // 1) Lead with questions grounded in THIS note’s content.
  for (const question of buildDocumentAskQuestions(analysis, tasks, opts).slice(0, 6)) {
    chips.push(question)
  }

  // 2) Action goals that name concrete signals from the note.
  if (openTasks[0]?.text) {
    chips.push(
      slovak
        ? `Pomôž dokončiť úlohu „${clip(openTasks[0].text)}“`
        : `Help me finish “${clip(openTasks[0].text)}”`,
    )
  }
  if (openTasks.length > 1) {
    chips.push(
      slovak
        ? `Zoradiť ${openTasks.length} otvorených úloh podľa priority`
        : `Prioritize the ${openTasks.length} open tasks in this note`,
    )
  }
  if (headings[0]) {
    chips.push(
      slovak
        ? `Prehĺb časť „${clip(headings[0])}“ a navrhni ďalšie kroky`
        : `Deep-dive “${clip(headings[0])}” and suggest next steps`,
    )
  }
  if (headings.length > 1) {
    chips.push(
      slovak
        ? `Kvíz z osnovy (najmä „${clip(headings[1])}“)`
        : `Quiz me on the outline (esp. “${clip(headings[1])}”)`,
    )
  }
  if (phrases[0]) {
    chips.push(
      slovak
        ? `Nájdi súvisiace poznámky k „${clip(phrases[0])}“`
        : `Find related notes about “${clip(phrases[0])}”`,
    )
  }
  if (people[0]) {
    chips.push(
      slovak
        ? `Meeting wrap: čo ostáva voči ${clip(people[0])}?`
        : `Meeting wrap: what’s left with ${clip(people[0])}?`,
    )
  }
  if (dates[0]) {
    chips.push(
      slovak
        ? `Priprav checklist k termínu ${clip(dates[0])}`
        : `Build a checklist for ${clip(dates[0])}`,
    )
  }
  if (wiki[0]) {
    chips.push(
      slovak
        ? `Ako súvisí táto poznámka s [[${clip(wiki[0])}]]?`
        : `How does this note connect to [[${clip(wiki[0])}]]?`,
    )
  } else if (phrases[1] || phrases[0]) {
    chips.push(
      slovak
        ? `Navrhni wiki odkazy pre túto poznámku`
        : `Suggest wiki links for this note`,
    )
  }

  if (analysis?.tone) {
    chips.push(
      slovak
        ? `Writing coach: uprav tón (${clip(analysis.tone, 24)})`
        : `Writing coach: tighten the ${clip(analysis.tone, 24)} tone`,
    )
  } else {
    chips.push(
      slovak ? 'Writing coach tipy pre túto poznámku' : 'Writing coach tips for this note',
    )
  }

  if (title && title.length >= 2 && !/^untitled$/i.test(title)) {
    chips.push(
      slovak
        ? `Čo ešte chýba v „${clip(title)}“?`
        : `What is still missing in “${clip(title)}”?`,
    )
    chips.push(
      slovak
        ? `Zhrň „${clip(title)}“ do 5 odrážok`
        : `Summarize “${clip(title)}” in 5 bullets`,
    )
  } else {
    chips.push(
      slovak
        ? 'Zhrň túto poznámku a nájdi súvisiace'
        : 'Summarize this note and find related notes',
    )
  }

  if (openTasks.length === 0) {
    chips.push(
      slovak ? 'Hlavné závery z tejto poznámky' : 'Key takeaways from this note',
    )
  }

  chips.push(slovak ? 'Organizuj tagy a priečinok' : 'Organize tags and folder for this note')

  return uniqueKeepOrder(chips, MAX_CHIPS)
}

/** Ranked agent tools that match signals in this note. */
export function buildAgentToolOptions(
  analysis: NlpDocumentAnalysis | null | undefined,
  tasks: DocumentTask[] | null | undefined,
): AgentToolId[] {
  const openTasks = (tasks ?? []).filter((task) => !task.checked)
  const mentionCount =
    (analysis?.mentions?.length ?? 0) +
    (analysis?.wikiLinks?.length ?? 0) +
    (analysis?.hosts?.length ?? 0)
  const ranked: Array<{ tool: AgentToolId; score: number }> = [
    { tool: 'summarize', score: 100 },
    { tool: 'takeaways', score: 96 },
    { tool: 'document_answer', score: 92 },
    { tool: 'dates', score: (analysis?.dates?.length ?? 0) > 0 ? 94 : 30 },
    { tool: 'meeting', score: mentionCount > 0 || openTasks.length > 0 ? 86 : 48 },
    { tool: 'outline', score: (analysis?.outline?.length ?? 0) > 0 ? 90 : 40 },
    { tool: 'quiz', score: (analysis?.outline?.length ?? 0) > 1 ? 82 : 28 },
    { tool: 'flashcards', score: (analysis?.outline?.length ?? 0) > 1 ? 84 : 42 },
    { tool: 'tasks', score: openTasks.length > 0 ? 91 : 22 },
    { tool: 'terminology', score: (analysis?.keywords?.length ?? 0) > 2 ? 72 : 50 },
    { tool: 'wiki', score: (analysis?.wikiLinks?.length ?? 0) > 0 ? 74 : 56 },
    { tool: 'organize', score: 62 },
    { tool: 'spellcheck', score: 52 },
    { tool: 'similar', score: (analysis?.keyphrases?.length ?? 0) > 0 ? 68 : 50 },
    { tool: 'style', score: analysis?.tone ? 70 : 54 },
    { tool: 'explain', score: 66 },
    { tool: 'simplify', score: 58 },
    { tool: 'action_items', score: openTasks.length > 0 ? 88 : 46 },
    { tool: 'glossary', score: (analysis?.keywords?.length ?? 0) > 2 ? 78 : 44 },
  ]

  ranked.sort((a, b) => b.score - a.score)
  return ranked.slice(0, MAX_TOOLS).map((item) => item.tool)
}

export const LIBRARY_AGENT_STARTER_CHIPS = [
  'agent.starters.themes',
  'agent.starters.openLoops',
  'agent.starters.deadlines',
  'agent.starters.connections',
] as const
