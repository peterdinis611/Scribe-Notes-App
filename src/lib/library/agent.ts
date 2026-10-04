import { invokeMatchAgentIntents } from '@/lib/db/api'
import { nlpAgentDocumentBrief, nlpPlanAgentGoal } from '@/lib/db/nlp-api'
import {
  applyAgentOptimize,
  bumpAgentRunCount,
  canRunAgentBudget,
  pushAgentEpisode,
  teachingsToMemoryContext,
  type AgentPrefs,
  type AgentRoleId,
  type AgentToolId,
  DEFAULT_AGENT_PREFS,
} from '@/lib/library/agent-prefs'
import {
  filterToolsByAgents,
  isAgentRoleEnabled,
  isRecipeAllowedByAgents,
  preferredToolsForRole,
} from '@/lib/library/agent-roles'
import { getAgentRecipe, type AgentRecipeId } from '@/lib/library/agent-recipes'
import {
  runAgentCitations,
  runAgentCommitments,
  runAgentContradictions,
  runAgentDatesLibrary,
  runAgentDecisions,
  runAgentDuplicates,
  runAgentGrammar,
  runAgentMeetingPack,
  runAgentMentions,
  runAgentNotePulse,
  runAgentOrganize,
  runAgentOutlineQuiz,
  runAgentPii,
  runAgentQuotes,
  runAgentRankTasks,
  runAgentReadingPlan,
  runAgentRevision,
  runAgentRewrite,
  runAgentSectionSummaries,
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
import {
  nlpActionItems,
  nlpCompareNotes,
  nlpExplainSelection,
  nlpFilesAnswer,
  nlpGlossary,
  nlpSimplify,
} from '@/lib/db/nlp-api'

export type { AgentToolId }

export const AGENT_MAX_STEPS = 3

export type AgentStepStatus = 'ok' | 'error' | 'skipped'

export type AgentStep = {
  tool: AgentToolId
  status: AgentStepStatus
  detail?: string
  answer?: string
  citations?: LibraryChatCitation[]
  spellIssues?: Array<{ word: string; suggestions: string[] }>
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
  'brief',
  'explain',
  'simplify',
  'action_items',
  'glossary',
  'compare_notes',
  'section_summaries',
  'decisions',
  'quotes',
  'pii',
  'rank_tasks',
  'contradictions',
  'commitments',
  'reading_plan',
  'note_pulse',
  'grammar',
  'mentions',
  'save_template',
])

const LIBRARY_ONLY_TOOLS = new Set<AgentToolId>([
  'duplicates',
  'citations',
  'library_answer',
  'files_answer',
])

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
  'explain',
  'simplify',
  'action_items',
  'glossary',
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
  brief: 'brief',
  explain: 'explain',
  simplify: 'simplify',
  action_items: 'action_items',
  glossary: 'glossary',
  compare_notes: 'compare_notes',
  section_summaries: 'section_summaries',
  decisions: 'decisions',
  quotes: 'quotes',
  pii: 'pii',
  rank_tasks: 'rank_tasks',
  contradictions: 'contradictions',
  commitments: 'commitments',
  reading_plan: 'reading_plan',
  note_pulse: 'note_pulse',
  grammar: 'grammar',
  mentions: 'mentions',
  save_template: 'save_template',
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
    {
      tool: 'save_template',
      needles: [
        'save as template',
        'make a template',
        'create template',
        'note to template',
        'sablonu',
        'ako sablonu',
        'uloz ako sablonu',
        'urob sablonu',
      ],
    },
    {
      tool: 'brief',
      needles: [
        'daily digest',
        'weekly digest',
        'denny digest',
        'tyzdenny digest',
        'denne zhrnutie',
        'tyzdenne zhrnutie',
      ],
    },
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
    {
      tool: 'explain',
      needles: ['explain', 'what does this mean', 'vysvetli', 'vysvetlenie', 'co to znamena'],
    },
    {
      tool: 'simplify',
      needles: ['simplify', 'simpler', 'plain language', 'zjednodus', 'jednoduchsie'],
    },
    {
      tool: 'action_items',
      needles: ['action items', 'extract actions', 'akcne body', 'ulohy z textu'],
    },
    {
      tool: 'glossary',
      needles: ['glossary', 'define terms', 'key terms', 'slovnik', 'pojmy', 'definicie'],
    },
    {
      tool: 'compare_notes',
      needles: ['compare notes', 'diff notes', 'porovnaj poznamky', 'porovnanie poznamok'],
    },
    {
      tool: 'files_answer',
      needles: ['files answer', 'ask files', 'sandboxed files', 'subory sandbox', 'files/'],
    },
    {
      tool: 'spellcheck',
      needles: [
        'spellcheck',
        'spell check',
        'spelling',
        'typo',
        'typos',
        'pravopis',
        'preklepy',
        'preklep',
        'skontroluj pravopis',
        'skontroluj preklepy',
        'oprav preklepy',
        'oprav pravopis',
        'check spelling',
        'fix spelling',
        'fix typos',
      ],
    },
    {
      tool: 'section_summaries',
      needles: ['section summary', 'section summaries', 'summarize sections', 'zhrnutie sekcii', 'zhrn sekcie', 'po kapitolach'],
    },
    {
      tool: 'decisions',
      needles: ['decision log', 'extract decisions', 'rozhodnutia', 'log rozhodnuti', 'co sme rozhodli'],
    },
    {
      tool: 'quotes',
      needles: ['extract quotes', 'pull quotes', 'citacie', 'citaty', 'vyber citaty'],
    },
    {
      tool: 'pii',
      needles: ['detect pii', 'privacy scan', 'personal data', 'citlive udaje', 'pii', 'sken sukromia', 'pred zdielanim'],
    },
    {
      tool: 'rank_tasks',
      needles: ['rank tasks', 'prioritize tasks', 'prioritize todos', 'zorad ulohy', 'priorita uloh', 'urgent tasks'],
    },
    {
      tool: 'contradictions',
      needles: ['contradiction', 'conflicting claims', 'rozpory', 'protirecenia', 'nekonzistentne tvrdenia'],
    },
    {
      tool: 'commitments',
      needles: ['commitment', 'commitments', 'i will', 'follow up', 'zavazky', 'sluby', 'co som slubil'],
    },
    {
      tool: 'reading_plan',
      needles: ['reading plan', 'study plan', 'study path', 'plan citania', 'studijny plan', 'ako citat'],
    },
    {
      tool: 'note_pulse',
      needles: ['note pulse', 'note health', 'library pulse', 'stav poznamky', 'zdravie poznamky'],
    },
    {
      tool: 'grammar',
      needles: ['grammar', 'grammar check', 'gramatika', 'skontroluj gramatiku', 'grammar tips'],
    },
    {
      tool: 'mentions',
      needles: ['mentions', 'people mentioned', '@mentions', 'spomenute osoby', 'kto je v poznamke', 'attendees'],
    },
    {
      tool: 'brief',
      needles: ['agent brief', 'document brief', 'full brief', 'kompletny brief', 'brief poznámky'],
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

function scopeTools(
  tools: AgentToolId[],
  scope: ChatScope,
  documentId?: string | null,
): AgentToolId[] {
  return tools.filter((tool) => {
    if (LIBRARY_ONLY_TOOLS.has(tool)) return true
    if (tool === 'dates' && (scope === 'library' || scope === 'folder')) return true
    if (tool === 'brief' && (scope === 'library' || scope === 'folder')) return true
    if (!DOCUMENT_TOOLS.has(tool)) return true
    if (scope === 'library' && !documentId) return false
    if (scope === 'folder' && !documentId && DOCUMENT_TOOLS.has(tool) && tool !== 'dates') {
      return false
    }
    return true
  })
}

function defaultAnswerTool(scope: ChatScope): AgentToolId {
  return scope === 'document' ? 'document_answer' : 'library_answer'
}

export function suggestFollowupRecipes(
  steps: AgentStep[],
  scope: ChatScope,
  agents = DEFAULT_AGENT_PREFS.agents,
): string[] {
  const ok = new Set(steps.filter((step) => step.status === 'ok').map((step) => step.tool))
  const out: string[] = []
  if (ok.has('dates') || ok.has('tasks') || ok.has('brief')) out.push('daily_digest', 'weekly_review')
  if (ok.has('meeting') || ok.has('tasks')) out.push('meeting_wrap')
  if (ok.has('outline') || ok.has('meeting')) out.push('note_to_template')
  if (ok.has('outline') || ok.has('flashcards')) out.push('study_pass')
  if (ok.has('glossary') || ok.has('outline')) out.push('deep_read')
  if (ok.has('duplicates') || ok.has('wiki')) out.push('cleanup')
  if (ok.has('spellcheck')) out.push('spellcheck', 'polish')
  if (ok.has('style') || ok.has('terminology')) out.push('polish')
  if (scope === 'document' && out.length === 0) out.push('spellcheck', 'polish', 'study_pass')
  if (scope !== 'document' && out.length === 0) out.push('daily_digest', 'weekly_review', 'cleanup')
  return [...new Set(out)]
    .filter((id) => isRecipeAllowedByAgents(id as AgentRecipeId, agents))
    .slice(0, 3)
}

function withRolePreferred(prefs: AgentPrefs, roleId?: AgentRoleId | null): AgentPrefs {
  if (!roleId || roleId === 'general') return prefs
  const boost = preferredToolsForRole(roleId)
  return {
    ...prefs,
    preferredTools: [
      ...boost,
      ...prefs.preferredTools.filter((tool) => !boost.includes(tool)),
    ].slice(0, 10),
  }
}

export async function planAgentGoal(
  goal: string,
  scope: ChatScope,
  documentId?: string | null,
  prefs: AgentPrefs = DEFAULT_AGENT_PREFS,
  opts?: {
    recipeId?: AgentRecipeId | null
    forceTools?: AgentToolId[]
    folderId?: string | null
    /** Active dock specialist — boosts that role’s tools. */
    roleId?: AgentRoleId | null
  },
): Promise<AgentPlan> {
  if (!prefs.enabled) {
    throw new Error('agent.disabled')
  }

  const effective = withRolePreferred(prefs, opts?.roleId)
  const trimmed = goal.trim()
  const fallback = defaultAnswerTool(scope)
  const fallbackAllowed = filterToolsByAgents([fallback], effective.agents)
  const safeFallback = fallbackAllowed[0] ?? filterToolsByAgents(
    ['library_answer', 'document_answer', 'summarize'],
    effective.agents,
  )[0]

  if (opts?.forceTools?.length) {
    const tools = applyAgentOptimize(scopeTools(opts.forceTools, scope, documentId), effective)
    return {
      goal: trimmed,
      scope,
      documentId,
      tools: tools.length > 0 ? tools : safeFallback ? [safeFallback] : [],
    }
  }

  if (opts?.recipeId) {
    if (!isRecipeAllowedByAgents(opts.recipeId, effective.agents)) {
      throw new Error('agent.roleDisabled')
    }
    const recipe = getAgentRecipe(opts.recipeId)
    if (recipe) {
      const tools = applyAgentOptimize(scopeTools(recipe.tools, scope, documentId), effective)
      return {
        goal: trimmed || opts.recipeId,
        scope,
        documentId,
        tools: tools.length > 0 ? tools : safeFallback ? [safeFallback] : [],
      }
    }
  }

  let intents: string[] = []
  try {
    const planned = await nlpPlanAgentGoal({
      goal: trimmed,
      scope: scope === 'folder' ? 'library' : scope,
      maxTools: effective.maxSteps,
    })
    intents = planned.tools
    if (planned.needsClarification && effective.askWhenUncertain) {
      const clarifyOptions = filterToolsByAgents(
        (planned.clarifyOptions ?? DEFAULT_CLARIFY)
          .map((item) => INTENT_TO_TOOL[item] ?? (item as AgentToolId))
          .filter((tool, index, list) => list.indexOf(tool) === index)
          .filter((tool) => {
            if (tool === 'document_answer') return scope === 'document' || Boolean(documentId)
            if (tool === 'library_answer') return scope === 'library' || !documentId
            if (DOCUMENT_TOOLS.has(tool)) return Boolean(documentId) || scope === 'document'
            return true
          }),
        effective.agents,
      ).slice(0, 5)
      return {
        goal: trimmed,
        scope,
        documentId,
        tools: [],
        needsClarification: true,
        clarifyOptions,
      }
    }
  } catch {
    try {
      intents = await invokeMatchAgentIntents(trimmed)
    } catch {
      intents = matchAgentIntentsSync(trimmed)
    }
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

  if (fromIntent.length === 0 && effective.askWhenUncertain) {
    const clarifyOptions = filterToolsByAgents(
      DEFAULT_CLARIFY.filter((tool) => {
        if (tool === 'document_answer') return scope === 'document' || Boolean(documentId)
        if (tool === 'library_answer') return scope !== 'document'
        if (DOCUMENT_TOOLS.has(tool)) return Boolean(documentId) || scope === 'document'
        return true
      }),
      effective.agents,
    ).slice(0, 5)
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
    fromIntent = safeFallback ? [safeFallback] : [fallback]
  }

  const scoped = scopeTools(fromIntent, scope, documentId)
  const tools = applyAgentOptimize(scoped.length > 0 ? scoped : safeFallback ? [safeFallback] : [fallback], effective)

  return {
    goal: trimmed,
    scope,
    documentId,
    tools: tools.length > 0 ? tools : safeFallback ? [safeFallback] : [],
  }
}

async function runTool(
  tool: AgentToolId,
  ctx: {
    goal: string
    scope: ChatScope
    documentId?: string | null
    folderId?: string | null
    memoryContext?: Array<{ role: string; text: string }>
    priorAnswers: string[]
    selectionText?: string | null
    compareDocumentId?: string | null
    stream?: boolean
  },
): Promise<LibraryChatResult> {
  const workingMemory = [
    ...(ctx.memoryContext ?? []),
    ...ctx.priorAnswers.map((text) => ({ role: 'assistant', text: text.slice(0, 800) })),
  ]

  if (tool === 'library_answer') {
    return askLibrary(ctx.goal, {
      folderId: ctx.scope === 'folder' ? ctx.folderId : null,
      stream: ctx.stream,
      context: workingMemory.length ? workingMemory : undefined,
    })
  }
  if (tool === 'document_answer') {
    return askDocument(ctx.documentId ?? '', ctx.goal, workingMemory, { stream: ctx.stream })
  }
  if (tool === 'duplicates') {
    return runAgentDuplicates()
  }
  if (tool === 'citations') {
    return runAgentCitations(ctx.goal)
  }
  if (tool === 'dates' && (ctx.scope === 'library' || ctx.scope === 'folder' || !ctx.documentId)) {
    return runAgentDatesLibrary()
  }
  if (tool === 'meeting') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentMeetingPack(ctx.documentId)
  }
  if (tool === 'section_summaries') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentSectionSummaries(ctx.documentId)
  }
  if (tool === 'decisions') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentDecisions(ctx.documentId)
  }
  if (tool === 'quotes') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentQuotes(ctx.documentId)
  }
  if (tool === 'pii') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentPii(ctx.documentId)
  }
  if (tool === 'rank_tasks') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentRankTasks(ctx.documentId)
  }
  if (tool === 'commitments') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentCommitments(ctx.documentId)
  }
  if (tool === 'reading_plan') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentReadingPlan(ctx.documentId)
  }
  if (tool === 'note_pulse') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentNotePulse(ctx.documentId)
  }
  if (tool === 'grammar') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentGrammar(ctx.documentId)
  }
  if (tool === 'mentions') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentMentions(ctx.documentId)
  }
  if (tool === 'contradictions') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    const otherId =
      ctx.compareDocumentId?.trim() ||
      ctx.goal.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]
    if (!otherId || otherId === ctx.documentId) {
      throw new Error('agent.compareNeedsOther')
    }
    return runAgentContradictions(ctx.documentId, otherId)
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
    if (!ctx.documentId && !ctx.selectionText) throw new Error('agent.needsDocument')
    return runAgentRewrite(ctx.documentId ?? 'selection', ctx.goal, ctx.selectionText)
  }
  if (tool === 'save_template') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return {
      answer:
        'Ready to save this note as a reusable template. Use **Save as template** below to name it and store it in your template library.',
      citations: [
        {
          documentId: ctx.documentId,
          title: 'Template',
          snippet: 'Open the save-as-template dialog',
        },
      ],
      followups: ['Polish this note first', 'Extract meeting wrap-up'],
    }
  }
  if (tool === 'brief') {
    if (ctx.scope === 'folder' && ctx.folderId) {
      const { runFolderDigest } = await import('@/lib/library/folder-digest')
      return runFolderDigest(ctx.folderId)
    }
    if (ctx.scope === 'library' || (ctx.scope === 'folder' && !ctx.documentId)) {
      const { runLibraryDigest } = await import('@/lib/library/library-digest')
      const period =
        /week|tyzden|týždeň|weekly/i.test(ctx.goal) || ctx.goal === 'weekly_review'
          ? 'week'
          : 'day'
      return runLibraryDigest(period)
    }
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    const brief = await nlpAgentDocumentBrief({
      documentId: ctx.documentId,
      goal: ctx.goal,
      limit: 8,
    })
    return {
      answer: brief.answer || 'No brief sections produced for this note.',
      citations: [
        {
          documentId: ctx.documentId,
          title: 'Agent brief',
          snippet: (brief.tools || []).join(' → '),
        },
      ],
    }
  }

  if (tool === 'files_answer') {
    try {
      const result = await nlpFilesAnswer({ question: ctx.goal, limit: 6 })
      return {
        answer: result.answer || 'No answer from files sandbox.',
        citations: (result.citations || []).map((item) => ({
          documentId: item.path,
          title: item.path,
          snippet: item.snippet || item.excerpt || '',
        })),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('FilesApiOffline')) {
        throw new Error('agent.filesApiOffline', { cause: error })
      }
      throw error
    }
  }

  if (tool === 'compare_notes') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    const otherId =
      ctx.compareDocumentId?.trim() ||
      ctx.goal.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]
    if (!otherId || otherId === ctx.documentId) {
      throw new Error('agent.compareNeedsOther')
    }
    const result = await nlpCompareNotes({
      documentIdA: ctx.documentId,
      documentIdB: otherId,
    })
    return {
      answer: result.summary || 'No comparison summary.',
      citations: [],
    }
  }

  if (tool === 'explain') {
    const text = ctx.selectionText?.trim() || undefined
    if (!text && !ctx.documentId) throw new Error('agent.needsDocument')
    const result = await nlpExplainSelection({
      documentId: text ? undefined : ctx.documentId ?? undefined,
      text,
    })
    return {
      answer: result.explanation || 'No explanation produced.',
      citations: [],
    }
  }

  if (tool === 'simplify') {
    const text = ctx.selectionText?.trim() || undefined
    if (!text && !ctx.documentId) throw new Error('agent.needsDocument')
    const result = await nlpSimplify({
      documentId: text ? undefined : ctx.documentId ?? undefined,
      text,
    })
    return {
      answer: result.simplified || 'No simplified text produced.',
      citations: [],
    }
  }

  if (tool === 'action_items') {
    if (!ctx.documentId && !ctx.selectionText?.trim()) throw new Error('agent.needsDocument')
    const result = await nlpActionItems({
      documentId: ctx.selectionText?.trim() ? undefined : ctx.documentId ?? undefined,
      text: ctx.selectionText?.trim() || undefined,
      limit: 12,
    })
    if (!result.items?.length) {
      return { answer: 'No action items found.', citations: [] }
    }
    return {
      answer: `**Action items (${result.count})**\n\n${result.items
        .map((item) => `- ${item.text}`)
        .join('\n')}`,
      citations: [],
    }
  }

  if (tool === 'glossary') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    const result = await nlpGlossary({ documentId: ctx.documentId, limit: 16 })
    if (!result.entries?.length) {
      return { answer: 'No glossary terms extracted.', citations: [] }
    }
    return {
      answer: `**Glossary**\n\n${result.entries
        .map((entry) => `- **${entry.term}** — ${entry.definition}`)
        .join('\n')}`,
      citations: [],
    }
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
  opts?: {
    recipeId?: AgentRecipeId | null
    forceTools?: AgentToolId[]
    folderId?: string | null
    selectionText?: string | null
    compareDocumentId?: string | null
    stream?: boolean
    /** Spellcheck agent: inject grammar teachings only. */
    grammarOnly?: boolean
    /** Active dock specialist. */
    roleId?: AgentRoleId | null
  },
): Promise<AgentRunResult> {
  if (!prefs.enabled) {
    throw new Error('agent.disabled')
  }
  if (opts?.roleId && !isAgentRoleEnabled(prefs.agents, opts.roleId)) {
    throw new Error('agent.roleDisabled')
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
      pinnedFacts: opts?.grammarOnly ? undefined : prefs.pinnedFacts,
      episodes: opts?.grammarOnly ? undefined : prefs.episodes,
      outputLanguage: prefs.outputLanguage,
      documentId,
      grammarOnly: opts?.grammarOnly,
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
      DOCUMENT_TOOLS.has(tool) &&
      tool !== 'dates' &&
      tool !== 'brief' &&
      tool !== 'rewrite' &&
      !LIBRARY_ONLY_TOOLS.has(tool)
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
        goal:
          tool === 'files_answer' && (!trimmed || opts?.recipeId === 'files_digest')
            ? trimmed || 'Summarize the key points across my files/ sandbox'
            : tool === 'brief' && opts?.recipeId === 'daily_digest'
              ? trimmed || 'daily digest'
              : tool === 'brief' && opts?.recipeId === 'weekly_review'
                ? trimmed || 'weekly_review'
                : trimmed,
        scope,
        documentId,
        folderId: opts?.folderId,
        memoryContext: contextWithTeachings,
        priorAnswers,
        selectionText: opts?.selectionText,
        compareDocumentId: opts?.compareDocumentId,
        stream: opts?.stream && (tool === 'library_answer' || tool === 'document_answer'),
      })
      steps.push({
        tool,
        status: 'ok',
        answer: result.answer,
        citations: result.citations,
        spellIssues: result.spellIssues,
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

  const recipeFollowups = suggestFollowupRecipes(steps, scope, prefs.agents).map(
    (id) => `recipe:${id}`,
  )

  return {
    answer,
    citations: mergeCitations(citationBuckets),
    steps,
    followups: [...followups, ...recipeFollowups].slice(0, 6),
    nextPrefs,
  }
}

export function agentMemoryContext(
  messages: Array<{ role: 'user' | 'assistant'; text: string }>,
): Array<{ role: string; text: string }> {
  return documentChatContext(messages)
}
