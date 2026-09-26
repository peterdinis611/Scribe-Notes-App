import type { DocumentTask, NlpDocumentAnalysis } from '@/lib/db/nlp-api'
import { buildDocumentAskQuestions } from '@/lib/library/document-ask-suggestions'
import type { AgentToolId } from '@/lib/library/agent-prefs'

const MAX_CHIPS = 8
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
  const chips: string[] = []
  const openTasks = (tasks ?? []).filter((task) => !task.checked)
  const hasOutline = (analysis?.outline?.length ?? 0) > 0
  const hasDates = (analysis?.dates?.length ?? 0) > 0

  chips.push(
    slovak ? 'Zhrň túto poznámku a nájdi súvisiace' : 'Summarize this note and find related notes',
  )
  if (openTasks.length > 0) {
    chips.push(
      slovak
        ? 'Otvorené úlohy a hlavné závery'
        : 'List open tasks and key takeaways',
    )
  } else {
    chips.push(slovak ? 'Hlavné závery z tejto poznámky' : 'Key takeaways from this note')
  }
  if (hasOutline) {
    chips.push(
      slovak
        ? 'Vytvor kartičky z osnovy'
        : 'Make flashcards from the outline',
    )
  }
  chips.push(
    slovak ? 'Writing coach tipy pre túto poznámku' : 'Writing coach tips for this note',
  )
  if (hasDates) {
    chips.push(
      slovak
        ? 'Zhrň termíny a čo robiť ďalej'
        : 'Summarize deadlines and what to do next',
    )
  }

  const grounded = buildDocumentAskQuestions(analysis, tasks, opts).slice(0, 3)
  for (const question of grounded) {
    chips.push(question)
  }

  const title = opts?.title?.trim()
  if (title && title.length >= 2 && !/^untitled$/i.test(title)) {
    chips.push(
      slovak
        ? `Čo ešte chýba v „${clip(title)}“?`
        : `What is still missing in “${clip(title)}”?`,
    )
  }

  return uniqueKeepOrder(chips, MAX_CHIPS)
}

/** Ranked agent tools that match signals in this note. */
export function buildAgentToolOptions(
  analysis: NlpDocumentAnalysis | null | undefined,
  tasks: DocumentTask[] | null | undefined,
): AgentToolId[] {
  const openTasks = (tasks ?? []).filter((task) => !task.checked)
  const ranked: Array<{ tool: AgentToolId; score: number }> = [
    { tool: 'summarize', score: 100 },
    { tool: 'takeaways', score: 96 },
    { tool: 'outline', score: (analysis?.outline?.length ?? 0) > 0 ? 90 : 40 },
    { tool: 'flashcards', score: (analysis?.outline?.length ?? 0) > 1 ? 84 : 42 },
    { tool: 'tasks', score: openTasks.length > 0 ? 88 : 20 },
    { tool: 'similar', score: 55 },
    { tool: 'style', score: 58 },
    { tool: 'document_answer', score: 50 },
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
