import { invokeMatchAgentIntents } from '@/lib/db/api'
import {
  applyAgentOptimize,
  teachingsToMemoryContext,
  type AgentPrefs,
  type AgentToolId,
  DEFAULT_AGENT_PREFS,
} from '@/lib/library/agent-prefs'
import {
  askDocument,
  askLibrary,
  documentChatContext,
  matchDocumentChatIntent,
  runDocumentChatAction,
  type ChatScope,
  type DocumentChatAction,
  type LibraryChatCitation,
  type LibraryChatResult,
} from '@/lib/library/library-chat'

export type { AgentToolId }

export const AGENT_MAX_STEPS = 3

/** Read-only MVP tool ids (subset of document chat actions + Q&A). */

export type AgentStepStatus = 'ok' | 'error' | 'skipped'

export type AgentStep = {
  tool: AgentToolId
  status: AgentStepStatus
  detail?: string
  answer?: string
  citations?: LibraryChatCitation[]
}

export type AgentPlan = {
  tools: AgentToolId[]
  goal: string
  scope: ChatScope
  documentId?: string | null
}

export type AgentRunResult = {
  answer: string
  citations: LibraryChatCitation[]
  steps: AgentStep[]
  followups?: string[]
}

const DOCUMENT_TOOLS = new Set<AgentToolId>([
  'document_answer',
  'summarize',
  'outline',
  'tasks',
  'similar',
  'style',
  'flashcards',
  'takeaways',
])

const INTENT_TO_TOOL: Record<string, AgentToolId> = {
  summarize: 'summarize',
  outline: 'outline',
  tasks: 'tasks',
  similar: 'similar',
  style: 'style',
  flashcards: 'flashcards',
  takeaways: 'takeaways',
}

function dedupeTools(tools: AgentToolId[], limit = AGENT_MAX_STEPS): AgentToolId[] {
  const seen = new Set<AgentToolId>()
  const out: AgentToolId[] = []
  for (const tool of tools) {
    if (seen.has(tool)) continue
    seen.add(tool)
    out.push(tool)
    if (out.length >= limit) break
  }
  return out
}

/** Sync multi-intent mirror for vitest without Tauri (ordered, max 3). */
export function matchAgentIntentsSync(goal: string): AgentToolId[] {
  const folded = goal
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (!folded) return []

  const rules: Array<{ tool: AgentToolId; needles: string[] }> = [
    { tool: 'summarize', needles: ['summarize', 'summary', 'tlldr', 'digest', 'zhrn', 'zhrnutie', 'strucne'] },
    { tool: 'outline', needles: ['outline', 'structure', 'heading', 'osnova', 'struktura', 'nadpisy'] },
    {
      tool: 'tasks',
      needles: ['task', 'todo', 'to-do', 'action item', 'checklist', 'ulohy', 'otvorene ulohy'],
    },
    {
      tool: 'similar',
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
    { tool: 'flashcards', needles: ['flashcard', 'study card', 'quiz me', 'karticky', 'kartick', 'kviz'] },
    {
      tool: 'takeaways',
      needles: ['takeaway', 'key point', 'executive summary', 'zavery', 'hlavne body', 'zhrnutie rozhodnut'],
    },
    {
      tool: 'style',
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

  const out: AgentToolId[] = []
  for (const rule of rules) {
    if (rule.needles.some((needle) => folded.includes(needle))) {
      out.push(rule.tool)
      if (out.length >= AGENT_MAX_STEPS) break
    }
  }
  return out
}

export async function planAgentGoal(
  goal: string,
  scope: ChatScope,
  documentId?: string | null,
  prefs: AgentPrefs = DEFAULT_AGENT_PREFS,
): Promise<AgentPlan> {
  if (!prefs.enabled) {
    throw new Error('agent.disabled')
  }

  const trimmed = goal.trim()
  let intents: string[] = []
  try {
    intents = await invokeMatchAgentIntents(trimmed)
  } catch {
    intents = matchAgentIntentsSync(trimmed)
  }

  let fromIntent = dedupeTools(
    intents
      .map((intent) => INTENT_TO_TOOL[intent])
      .filter((tool): tool is AgentToolId => Boolean(tool)),
    AGENT_MAX_STEPS,
  )

  if (fromIntent.length === 0) {
    const single = matchDocumentChatIntent(trimmed)
    if (single && INTENT_TO_TOOL[single]) {
      fromIntent = [INTENT_TO_TOOL[single]]
    }
  }

  if (fromIntent.length === 0) {
    fromIntent = [scope === 'document' ? 'document_answer' : 'library_answer']
  }

  const scoped = fromIntent.filter((tool) => {
    if (!DOCUMENT_TOOLS.has(tool)) return true
    if (scope === 'library' && !documentId) return false
    return true
  })

  const tools = applyAgentOptimize(
    scoped.length > 0
      ? scoped
      : [scope === 'document' ? 'document_answer' : 'library_answer'],
    prefs,
  )

  return {
    goal: trimmed,
    scope,
    documentId,
    tools:
      tools.length > 0
        ? tools
        : [scope === 'document' ? 'document_answer' : 'library_answer'],
  }
}

async function runTool(
  tool: AgentToolId,
  ctx: {
    goal: string
    documentId?: string | null
    memoryContext?: Array<{ role: string; text: string }>
    priorAnswers: string[]
  },
): Promise<LibraryChatResult> {
  const workingMemory = [
    ...(ctx.memoryContext ?? []),
    ...ctx.priorAnswers.map((text) => ({ role: 'assistant', text: text.slice(0, 800) })),
  ]

  if (tool === 'library_answer') {
    return askLibrary(ctx.goal)
  }
  if (tool === 'document_answer') {
    return askDocument(ctx.documentId ?? '', ctx.goal, workingMemory)
  }

  const action = tool as DocumentChatAction
  if (!ctx.documentId) {
    throw new Error('libraryChat.noActiveDocument')
  }
  return runDocumentChatAction(ctx.documentId, action)
}

function mergeCitations(lists: LibraryChatCitation[][]): LibraryChatCitation[] {
  const seen = new Set<string>()
  const out: LibraryChatCitation[] = []
  for (const list of lists) {
    for (const item of list) {
      const key = `${item.documentId}:${item.snippet}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
      if (out.length >= 12) return out
    }
  }
  return out
}

/** Execute a planned tool loop with soft-fail per step. */
export async function runAgentGoal(
  goal: string,
  scope: ChatScope,
  documentId?: string | null,
  memoryContext?: Array<{ role: string; text: string }>,
  prefs: AgentPrefs = DEFAULT_AGENT_PREFS,
): Promise<AgentRunResult> {
  if (!prefs.enabled) {
    throw new Error('agent.disabled')
  }

  const trimmed = goal.trim()
  if (!trimmed) {
    throw new Error('libraryChat.emptyQuestion')
  }

  const plan = await planAgentGoal(trimmed, scope, documentId, prefs)
  const contextWithTeachings = [
    ...teachingsToMemoryContext(prefs.teachings),
    ...(memoryContext ?? []),
  ]
  const steps: AgentStep[] = []
  const priorAnswers: string[] = []
  const sectionAnswers: string[] = []
  const citationBuckets: LibraryChatCitation[][] = []
  const followups: string[] = []

  for (const tool of plan.tools) {
    if (DOCUMENT_TOOLS.has(tool) && !documentId && scope === 'document') {
      steps.push({
        tool,
        status: 'skipped',
        detail: 'libraryChat.noActiveDocument',
      })
      continue
    }
    if (DOCUMENT_TOOLS.has(tool) && !documentId) {
      steps.push({
        tool,
        status: 'skipped',
        detail: 'agent.needsDocument',
      })
      continue
    }

    try {
      const result = await runTool(tool, {
        goal: trimmed,
        documentId,
        memoryContext: contextWithTeachings,
        priorAnswers,
      })
      steps.push({
        tool,
        status: 'ok',
        answer: result.answer,
        citations: result.citations,
      })
      priorAnswers.push(result.answer)
      sectionAnswers.push(`### ${tool}\n\n${result.answer}`)
      citationBuckets.push(result.citations)
      if (result.followups?.length) {
        followups.push(...result.followups)
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      steps.push({ tool, status: 'error', detail })
    }
  }

  const answer =
    sectionAnswers.length > 0
      ? sectionAnswers.join('\n\n')
      : steps.every((step) => step.status !== 'ok')
        ? steps.map((step) => `**${step.tool}**: ${step.detail ?? step.status}`).join('\n')
        : ''

  return {
    answer,
    citations: mergeCitations(citationBuckets),
    steps,
    followups: followups.slice(0, 6),
  }
}

export function agentMemoryContext(
  messages: Array<{ role: 'user' | 'assistant'; text: string }>,
): Array<{ role: string; text: string }> {
  return documentChatContext(messages)
}
