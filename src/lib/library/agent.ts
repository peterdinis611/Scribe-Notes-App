import { invokeMatchAgentIntents } from '@/lib/db/api'
import {
  applyAgentOptimize,
  bumpAgentRunCount,
  canRunAgentBudget,
  pushAgentEpisode,
  teachingsToMemoryContext,
  type AgentPrefs,
  type AgentToolId,
  DEFAULT_AGENT_PREFS,
} from '@/lib/library/agent-prefs'
import { getAgentRecipe, type AgentRecipeId } from '@/lib/library/agent-recipes'
import {
  runAgentCitations,
  runAgentDatesLibrary,
  runAgentDuplicates,
  runAgentMeetingPack,
  runAgentOrganize,
  runAgentOutlineQuiz,
  runAgentRevision,
  runAgentRewrite,
} from '@/lib/library/agent-tools'
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
  /** True when askWhenUncertain and no clear intent matched. */
  needsClarification?: boolean
  clarifyOptions?: AgentToolId[]
}

export type AgentRunResult = {
  answer: string
  citations: LibraryChatCitation[]
  steps: AgentStep[]
  followups?: string[]
  needsClarification?: boolean
  clarifyOptions?: AgentToolId[]
  /** Updated prefs after budget/episode bookkeeping (caller should persist). */
  nextPrefs?: AgentPrefs
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
  'dates',
  'meeting',
  'terminology',
  'wiki',
  'organize',
  'quiz',
  'revision',
  'spellcheck',
  'rewrite',
])

const LIBRARY_ONLY_TOOLS = new Set<AgentToolId>(['duplicates', 'citations', 'library_answer'])

const CHAT_ACTION_TOOLS = new Set<AgentToolId>([
  'summarize',
  'outline',
  'tasks',
  'similar',
  'style',
  'flashcards',
  'takeaways',
  'dates',
  'terminology',
  'wiki',
  'spellcheck',
])

const INTENT_TO_TOOL: Record<string, AgentToolId> = {
  summarize: 'summarize',
  outline: 'outline',
  tasks: 'tasks',
  similar: 'similar',
  style: 'style',
  flashcards: 'flashcards',
  takeaways: 'takeaways',
  dates: 'dates',
  terminology: 'terminology',
  wiki: 'wiki',
  spellcheck: 'spellcheck',
  meeting: 'meeting',
  organize: 'organize',
  duplicates: 'duplicates',
  citations: 'citations',
  quiz: 'quiz',
  revision: 'revision',
  rewrite: 'rewrite',
}

const DEFAULT_CLARIFY: AgentToolId[] = [
  'summarize',
  'takeaways',
  'tasks',
  'dates',
  'document_answer',
  'library_answer',
]

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
      tool: 'dates',
      needles: ['date', 'deadline', 'due date', 'schedule', 'datumy', 'terminy', 'this week', 'tento tyzden'],
    },
    {
      tool: 'meeting',
      needles: ['meeting', 'standup', 'retro', 'meeting notes', 'zapis zo stretnut', 'porada', 'rozhodnutia zo stretnut'],
    },
    {
      tool: 'terminology',
      needles: ['terminology', 'term consistency', 'inconsistent term', 'terminologia', 'konzistencia pojmov', 'nekonzistent'],
    },
    { tool: 'wiki', needles: ['wiki link', 'wikilink', 'backlink', 'wiki odkazy', 'prepojen'] },
    {
      tool: 'organize',
      needles: ['organize', 'suggest folder', 'suggest tag', 'zarad', 'priecinok', 'tagy', 'organizuj'],
    },
    {
      tool: 'duplicates',
      needles: ['duplicate', 'redundant', 'near duplicate', 'duplicit', 'redundantn', 'podobne subory'],
    },
    {
      tool: 'citations',
      needles: ['citation', 'cite', 'source for', 'citac', 'zdroje', 'podloz'],
    },
    {
      tool: 'quiz',
      needles: ['outline quiz', 'quiz from outline', 'kviz z osnovy', 'test z osnovy'],
    },
    {
      tool: 'revision',
      needles: ['revision', 'what changed', 'diff summary', 'co sa zmenilo', 'revizia', 'zmeny medzi'],
    },
    {
      tool: 'rewrite',
      needles: ['rewrite', 'rephrase', 'prepis', 'preformuluj'],
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
    { tool: 'spellcheck', needles: ['spellcheck', 'spelling', 'typo', 'pravopis', 'preklepy'] },
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

function scopeTools(
  tools: AgentToolId[],
  scope: ChatScope,
  documentId?: string | null,
): AgentToolId[] {
  return tools.filter((tool) => {
    if (LIBRARY_ONLY_TOOLS.has(tool)) return true
    if (!DOCUMENT_TOOLS.has(tool)) return true
    if (tool === 'dates' && scope === 'library') return true
    if (scope === 'library' && !documentId) return false
    return true
  })
}

export async function planAgentGoal(
  goal: string,
  scope: ChatScope,
  documentId?: string | null,
  prefs: AgentPrefs = DEFAULT_AGENT_PREFS,
  opts?: { recipeId?: AgentRecipeId | null; forceTools?: AgentToolId[] },
): Promise<AgentPlan> {
  if (!prefs.enabled) {
    throw new Error('agent.disabled')
  }

  const trimmed = goal.trim()

  if (opts?.forceTools?.length) {
    const tools = applyAgentOptimize(scopeTools(opts.forceTools, scope, documentId), prefs)
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

  if (opts?.recipeId) {
    const recipe = getAgentRecipe(opts.recipeId)
    if (recipe) {
      const tools = applyAgentOptimize(scopeTools(recipe.tools, scope, documentId), prefs)
      return {
        goal: trimmed || opts.recipeId,
        scope,
        documentId,
        tools:
          tools.length > 0
            ? tools
            : [scope === 'document' ? 'document_answer' : 'library_answer'],
      }
    }
  }

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

  if (fromIntent.length === 0 && prefs.askWhenUncertain) {
    const clarifyOptions = DEFAULT_CLARIFY.filter((tool) => {
      if (tool === 'document_answer') return scope === 'document' || Boolean(documentId)
      if (tool === 'library_answer') return scope === 'library' || !documentId
      if (DOCUMENT_TOOLS.has(tool)) return Boolean(documentId) || scope === 'document'
      return true
    }).slice(0, 5)
    return {
      goal: trimmed,
      scope,
      documentId,
      tools: [],
      needsClarification: true,
      clarifyOptions,
    }
  }

  if (fromIntent.length === 0) {
    fromIntent = [scope === 'document' ? 'document_answer' : 'library_answer']
  }

  const scoped = scopeTools(fromIntent, scope, documentId)
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
    scope: ChatScope
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
  if (tool === 'duplicates') {
    return runAgentDuplicates()
  }
  if (tool === 'citations') {
    return runAgentCitations(ctx.goal)
  }
  if (tool === 'dates' && (ctx.scope === 'library' || !ctx.documentId)) {
    return runAgentDatesLibrary()
  }
  if (tool === 'meeting') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentMeetingPack(ctx.documentId)
  }
  if (tool === 'organize') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentOrganize(ctx.documentId)
  }
  if (tool === 'quiz') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentOutlineQuiz(ctx.documentId)
  }
  if (tool === 'revision') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentRevision(ctx.documentId)
  }
  if (tool === 'rewrite') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentRewrite(ctx.documentId, ctx.goal)
  }

  if (CHAT_ACTION_TOOLS.has(tool)) {
    if (!ctx.documentId) throw new Error('libraryChat.noActiveDocument')
    return runDocumentChatAction(ctx.documentId, tool as DocumentChatAction)
  }

  throw new Error(`Unknown agent tool: ${tool}`)
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

function episodeSummary(steps: AgentStep[], goal: string): string {
  const ok = steps.filter((step) => step.status === 'ok').map((step) => step.tool)
  if (!ok.length) return `Failed: ${goal.slice(0, 80)}`
  return `Ran ${ok.join(' → ')} for “${goal.slice(0, 60)}”`
}

/** Execute a planned tool loop with soft-fail per step. */
export async function runAgentGoal(
  goal: string,
  scope: ChatScope,
  documentId?: string | null,
  memoryContext?: Array<{ role: string; text: string }>,
  prefs: AgentPrefs = DEFAULT_AGENT_PREFS,
  opts?: { recipeId?: AgentRecipeId | null; forceTools?: AgentToolId[] },
): Promise<AgentRunResult> {
  if (!prefs.enabled) {
    throw new Error('agent.disabled')
  }
  if (!canRunAgentBudget(prefs)) {
    throw new Error('agent.budgetExceeded')
  }

  const trimmed = goal.trim()
  if (!trimmed && !opts?.recipeId && !opts?.forceTools?.length) {
    throw new Error('libraryChat.emptyQuestion')
  }

  const plan = await planAgentGoal(trimmed || 'recipe', scope, documentId, prefs, opts)

  if (plan.needsClarification) {
    return {
      answer: '',
      citations: [],
      steps: [],
      needsClarification: true,
      clarifyOptions: plan.clarifyOptions,
    }
  }

  const contextWithTeachings = [
    ...teachingsToMemoryContext(prefs.teachings, {
      pinnedFacts: prefs.pinnedFacts,
      episodes: prefs.episodes,
      outputLanguage: prefs.outputLanguage,
      documentId,
    }),
    ...(memoryContext ?? []),
  ]
  const steps: AgentStep[] = []
  const priorAnswers: string[] = []
  const sectionAnswers: string[] = []
  const citationBuckets: LibraryChatCitation[][] = []
  const followups: string[] = []

  for (const tool of plan.tools) {
    const needsDoc =
      DOCUMENT_TOOLS.has(tool) && tool !== 'dates' && !LIBRARY_ONLY_TOOLS.has(tool)
    if (needsDoc && !documentId) {
      steps.push({
        tool,
        status: 'skipped',
        detail: scope === 'document' ? 'libraryChat.noActiveDocument' : 'agent.needsDocument',
      })
      continue
    }

    try {
      const result = await runTool(tool, {
        goal: trimmed,
        scope,
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

  let nextPrefs = bumpAgentRunCount(prefs)
  if (steps.some((step) => step.status === 'ok')) {
    nextPrefs = pushAgentEpisode(nextPrefs, {
      goal: trimmed || String(opts?.recipeId ?? 'run'),
      summary: episodeSummary(steps, trimmed || String(opts?.recipeId ?? 'run')),
      documentId,
    })
  }

  return {
    answer,
    citations: mergeCitations(citationBuckets),
    steps,
    followups: followups.slice(0, 6),
    nextPrefs,
  }
}

export function agentMemoryContext(
  messages: Array<{ role: 'user' | 'assistant'; text: string }>,
): Array<{ role: string; text: string }> {
  return documentChatContext(messages)
}
