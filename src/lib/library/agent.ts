import { invokeMatchAgentIntents, invokeMatchDocumentChatIntent } from '@/lib/db/api'
import { nlpAgentDocumentBrief, nlpPlanAgentGoal } from '@/lib/db/nlp-api'
import {
  AGENT_MAX_STEPS_HARD,
  applyAgentOptimize,
  bumpAgentRunCount,
  canRunAgentBudget,
  pushAgentEpisode,
  teachingsToMemoryContext,
  type AgentMaxSteps,
  type AgentPrefs,
  type AgentRoleId,
  type AgentToolId,
  DEFAULT_AGENT_PREFS,
} from '@/lib/library/agent-prefs'
import {
  runAgentCanvasSummarize,
  runAgentCanvasTemplate,
  runAgentCanvasToNote,
} from '@/lib/library/agent-canvas'
import {
  handoffsToMemoryContext,
  loadHandoffInbox,
  maybeAutoHandoffAfterRun,
  parseHandoffGoal,
  sendHandoffBetweenAgents,
} from '@/lib/library/agent-handoff'
import { listSuccessfulPlanTools } from '@/lib/library/agent-plan-feedback'
import {
  isWeakAgentAnswer,
  normalizePlanPhases,
  nowToolsFromPhases,
  phasesToFollowups,
  type AgentPlanPhase,
} from '@/lib/library/agent-phases'

export type { AgentPlanPhase }
import {
  filterToolsByAgents,
  isAgentRoleEnabled,
  isRecipeAllowedByAgents,
  preferredToolsForRole,
  toolsAllowedByAgents,
} from '@/lib/library/agent-roles'
import { resolveAgentRecipe, type AgentRecipeId } from '@/lib/library/agent-recipes'
import { runAgentFilesIngest } from '@/lib/library/agent-files-ingest'
import {
  runAgentCitations,
  runAgentCommitments,
  runAgentForwardPlan,
  runAgentContinuation,
  runAgentContradictions,
  runAgentDatesLibrary,
  runAgentDecisions,
  runAgentDuplicates,
  runAgentGrammar,
  runAgentKeywords,
  runAgentLibraryReport,
  runAgentMeetingPack,
  runAgentMentions,
  runAgentNotePulse,
  runAgentOpenLoops,
  runAgentOrganize,
  runAgentOutlineQuiz,
  runAgentPii,
  runAgentQuotes,
  runAgentRankTasks,
  runAgentReadingPlan,
  runAgentRevision,
  runAgentRewrite,
  runAgentSaveTemplate,
  runAgentSectionSummaries,
  runAgentTemplateHints,
  runAgentTerminologyLibrary,
  runAgentTitle,
  runAgentTone,
  runAgentWikiHealth,
} from '@/lib/library/agent-tools'
import {
  askDocument,
  askLibrary,
  documentChatContext,
  runDocumentChatAction,
  type ChatScope,
  type DocumentChatAction,
  type LibraryChatCitation,
  type LibraryChatResult,
} from '@/lib/library/library-chat'
import {
  nlpActionItems,
  nlpCodeBrief,
  nlpCompareNotes,
  nlpExplainSelection,
  nlpFilesAnswer,
  nlpGlossary,
  nlpSimplify,
} from '@/lib/db/nlp-api'

export type { AgentToolId }

export const AGENT_MAX_STEPS = AGENT_MAX_STEPS_HARD

export type AgentStepStatus = 'ok' | 'error' | 'skipped'

export type AgentStep = {
  tool: AgentToolId
  status: AgentStepStatus
  detail?: string
  answer?: string
  citations?: LibraryChatCitation[]
  spellIssues?: Array<{ word: string; suggestions: string[] }>
}

export type AgentPlanSource = 'jepa' | 'python' | 'llm' | 'recipe' | 'force' | 'fallback'

export type AgentPlanMeta = {
  source: AgentPlanSource | string
  topLabel?: string | null
  confidence?: number | null
}

export type AgentPlan = {
  tools: AgentToolId[]
  goal: string
  scope: ChatScope
  documentId?: string | null
  /** True when askWhenUncertain and no clear intent matched. */
  needsClarification?: boolean
  clarifyOptions?: AgentToolId[]
  clarifyLabels?: string[]
  planMeta?: AgentPlanMeta
  /** Multi-horizon plan: now runs immediately; next/later become chips. */
  phases?: AgentPlanPhase[]
}

export type AgentRunResult = {
  answer: string
  citations: LibraryChatCitation[]
  steps: AgentStep[]
  followups?: string[]
  needsClarification?: boolean
  clarifyOptions?: AgentToolId[]
  clarifyLabels?: string[]
  planMeta?: AgentPlanMeta
  phases?: AgentPlanPhase[]
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
  'code_brief',
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
  'forward_plan',
  'reading_plan',
  'note_pulse',
  'grammar',
  'mentions',
  'open_loops',
  'tone',
  'title',
  'continuation',
  'template_hints',
  'save_template',
  'keywords',
  'canvas_summarize',
  'canvas_to_note',
  'canvas_template',
])

const LIBRARY_ONLY_TOOLS = new Set<AgentToolId>([
  'duplicates',
  'citations',
  'library_answer',
  'files_answer',
  'files_ingest',
  'library_report',
  'terminology_library',
  'wiki_health',
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
  forward_plan: 'forward_plan',
  reading_plan: 'reading_plan',
  note_pulse: 'note_pulse',
  grammar: 'grammar',
  mentions: 'mentions',
  open_loops: 'open_loops',
  tone: 'tone',
  title: 'title',
  continuation: 'continuation',
  template_hints: 'template_hints',
  library_report: 'library_report',
  terminology_library: 'terminology_library',
  files_answer: 'files_answer',
  files_ingest: 'files_ingest',
  code_brief: 'code_brief',
  save_template: 'save_template',
  handoff: 'handoff',
  keywords: 'keywords',
  wiki_health: 'wiki_health',
  canvas_summarize: 'canvas_summarize',
  canvas_to_note: 'canvas_to_note',
  canvas_template: 'canvas_template',
}

function recipeStepCap(prefsMax: AgentMaxSteps, recipeToolCount: number): AgentMaxSteps {
  return Math.min(AGENT_MAX_STEPS_HARD, Math.max(prefsMax, recipeToolCount)) as AgentMaxSteps
}

const DEFAULT_CLARIFY: AgentToolId[] = [
  'summarize',
  'takeaways',
  'tasks',
  'dates',
  'document_answer',
  'library_answer',
]

function dedupeTools(tools: AgentToolId[], limit: number = AGENT_MAX_STEPS): AgentToolId[] {
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

/** Canonical: `scribe_ui::suggest_followup_recipes` (Tauri `suggest_followup_recipes_ui`). */
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
  if (ok.has('duplicates') || ok.has('wiki') || ok.has('wiki_health')) out.push('cleanup', 'wiki_cleanup')
  if (ok.has('canvas_summarize') || ok.has('canvas_to_note')) out.push('canvas_board')
  if (ok.has('files_answer') || ok.has('files_ingest')) {
    out.push('files_learn', 'files_to_library', 'files_digest')
  }
  if (ok.has('code_brief') || ok.has('explain') || ok.has('outline')) out.push('code_pass')
  if (ok.has('code_brief') || ok.has('pii') || ok.has('glossary')) out.push('code_audit')
  if (ok.has('spellcheck')) out.push('spellcheck', 'polish')
  if (ok.has('style') || ok.has('terminology')) out.push('polish')
  if (scope === 'document' && out.length === 0) out.push('spellcheck', 'polish', 'study_pass')
  if (scope !== 'document' && out.length === 0) {
    out.push('daily_digest', 'weekly_review', 'cleanup', 'files_learn')
  }
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
    recipeId?: AgentRecipeId | string | null
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
      planMeta: { source: 'force' },
    }
  }

  if (opts?.recipeId) {
    const recipe = resolveAgentRecipe(opts.recipeId, prefs.customRecipes)
    if (recipe) {
      if (!recipe.custom) {
        if (!isRecipeAllowedByAgents(opts.recipeId as AgentRecipeId, effective.agents)) {
          throw new Error('agent.roleDisabled')
        }
      } else {
        const custom = prefs.customRecipes.find((item) => item.id === recipe.id)
        if (custom?.roleId && !isAgentRoleEnabled(effective.agents, custom.roleId)) {
          throw new Error('agent.roleDisabled')
        }
      }
      const stepCap = recipeStepCap(effective.maxSteps, recipe.tools.length)
      const tools = applyAgentOptimize(scopeTools(recipe.tools, scope, documentId), {
        ...effective,
        maxSteps: stepCap,
      })
      return {
        goal: trimmed || recipe.label || recipe.id,
        scope,
        documentId,
        tools: tools.length > 0 ? tools : safeFallback ? [safeFallback] : [],
        planMeta: { source: 'recipe', topLabel: recipe.label || recipe.id },
      }
    }
  }

  const activeRoleId: AgentRoleId = opts?.roleId ?? 'general'
  const inbox = await loadHandoffInbox(activeRoleId, 'pending', 8)
  const handoffSummaries = inbox
    .filter((item) => item.status === 'pending')
    .slice(0, 6)
    .map((item) => `From ${item.fromAgentId}: ${item.summary}`)
  const feedbackTools = listSuccessfulPlanTools(24)

  let intents: string[] = []
  let planMeta: AgentPlanMeta | undefined
  let nlpPhases: unknown = null
  try {
    const planned = await nlpPlanAgentGoal({
      goal: trimmed,
      scope: scope === 'folder' ? 'library' : scope,
      maxTools: effective.maxSteps,
      role: activeRoleId,
      allowedTools: [...toolsAllowedByAgents(effective.agents)],
      handoffs: handoffSummaries.length > 0 ? handoffSummaries : null,
      feedbackTools: feedbackTools.length > 0 ? feedbackTools : null,
    })
    intents = planned.tools
    nlpPhases = planned.phases ?? null
    planMeta = {
      source: planned.source || 'python',
      topLabel: planned.topLabel ?? planned.jepa?.topLabel ?? null,
      confidence: planned.confidence ?? planned.jepa?.confidence ?? null,
    }
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
        clarifyLabels: planned.clarifyLabels?.slice(0, clarifyOptions.length),
        planMeta,
        phases: [],
      }
    }
  } catch {
    try {
      intents = await invokeMatchAgentIntents(trimmed)
    } catch {
      // Rust intent router unavailable (e.g. vitest without Tauri).
      intents = []
    }
    planMeta = { source: 'fallback' }
  }

  let fromIntent = dedupeTools(
    intents
      .map((intent) => INTENT_TO_TOOL[intent] ?? (intent as AgentToolId))
      .filter((tool): tool is AgentToolId => Boolean(tool)),
    effective.maxSteps,
  )

  // Pending handoff → soft-prefer role tools when NLP returned nothing useful.
  if (fromIntent.length === 0 && handoffSummaries.length > 0) {
    const roleBoost = preferredToolsForRole(activeRoleId).slice(0, 2)
    if (roleBoost.length > 0) fromIntent = roleBoost
  }

  if (fromIntent.length === 0) {
    try {
      const single = await invokeMatchDocumentChatIntent(trimmed)
      if (single && INTENT_TO_TOOL[single]) {
        fromIntent = [INTENT_TO_TOOL[single]]
      }
    } catch {
      /* Rust intent router unavailable */
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
      planMeta: planMeta ?? { source: 'fallback' },
    }
  }

  if (fromIntent.length === 0) {
    fromIntent = safeFallback ? [safeFallback] : [fallback]
  }

  const scoped = scopeTools(fromIntent, scope, documentId)
  const tools = applyAgentOptimize(scoped.length > 0 ? scoped : safeFallback ? [safeFallback] : [fallback], effective)
  const finalTools = tools.length > 0 ? tools : safeFallback ? [safeFallback] : []
  const phases = normalizePlanPhases(nlpPhases, finalTools, trimmed).map((phase) => ({
    ...phase,
    tools: applyAgentOptimize(scopeTools(phase.tools, scope, documentId), {
      ...effective,
      maxSteps: Math.min(effective.maxSteps, Math.max(1, phase.tools.length)) as AgentMaxSteps,
    }),
  }))

  return {
    goal: trimmed,
    scope,
    documentId,
    tools: nowToolsFromPhases(phases, finalTools),
    planMeta: planMeta ?? { source: 'python' },
    phases,
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
    roleId?: AgentRoleId | null
  },
): Promise<LibraryChatResult> {
  const workingMemory = [
    ...(ctx.memoryContext ?? []),
    ...ctx.priorAnswers.map((text) => ({ role: 'assistant', text: text.slice(0, 800) })),
  ]

  if (tool === 'handoff') {
    const fromAgentId = ctx.roleId ?? 'general'
    const prior = ctx.priorAnswers.filter(Boolean).join('\n\n').trim()
    const parsed = parseHandoffGoal(ctx.goal, fromAgentId)
    const toAgentId = parsed?.toAgentId
    const summary =
      parsed?.summary ||
      prior.slice(0, 600) ||
      ctx.goal.trim()
    if (!toAgentId) {
      throw new Error('agent.handoffNeedsTarget')
    }
    if (summary.trim().length < 2) {
      throw new Error('agent.handoffEmpty')
    }
    const sent = await sendHandoffBetweenAgents({
      fromAgentId,
      toAgentId,
      summary,
      documentId: ctx.documentId,
      payload: { goal: ctx.goal.slice(0, 160), priorTools: true },
    })
    if (!sent) {
      throw new Error('agent.handoffFailed')
    }
    return {
      answer: `Handoff sent to **${toAgentId}**:\n\n${sent.summary}`,
      citations: [],
    }
  }

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
  if (tool === 'forward_plan') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentForwardPlan(ctx.documentId)
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
  if (tool === 'open_loops') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentOpenLoops(ctx.documentId)
  }
  if (tool === 'tone') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentTone(ctx.documentId)
  }
  if (tool === 'title') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentTitle(ctx.documentId)
  }
  if (tool === 'continuation') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentContinuation(ctx.documentId)
  }
  if (tool === 'template_hints') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentTemplateHints(ctx.documentId)
  }
  if (tool === 'library_report') {
    return runAgentLibraryReport()
  }
  if (tool === 'terminology_library') {
    return runAgentTerminologyLibrary()
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
    return runAgentSaveTemplate(ctx.documentId)
  }
  if (tool === 'keywords') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentKeywords(ctx.documentId)
  }
  if (tool === 'wiki_health') {
    return runAgentWikiHealth()
  }
  if (tool === 'canvas_summarize') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentCanvasSummarize(ctx.documentId)
  }
  if (tool === 'canvas_to_note') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentCanvasToNote(ctx.documentId)
  }
  if (tool === 'canvas_template') {
    if (!ctx.documentId) throw new Error('agent.needsDocument')
    return runAgentCanvasTemplate(ctx.documentId, ctx.goal)
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
        followups: [
          'recipe:files_learn',
          'recipe:files_to_library',
          'teach:files',
        ],
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('FilesApiOffline')) {
        throw new Error('agent.filesApiOffline', { cause: error })
      }
      throw error
    }
  }

  if (tool === 'files_ingest') {
    try {
      const result = await runAgentFilesIngest(ctx.goal)
      return {
        answer: result.answer,
        citations: result.citations,
        followups: result.followups ?? [
          'recipe:files_to_library',
          'recipe:weekly_review',
          'teach:files',
        ],
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

  if (tool === 'code_brief') {
    const text = ctx.selectionText?.trim() || undefined
    if (!text && !ctx.documentId) throw new Error('agent.needsDocument')
    const result = await nlpCodeBrief({
      documentId: text ? undefined : ctx.documentId ?? undefined,
      text,
    })
    return {
      answer: result.answer || result.brief || 'No code brief produced.',
      citations: [],
      followups: ['recipe:code_pass', 'recipe:code_audit', 'recipe:files_learn', 'teach:code'],
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
    recipeId?: AgentRecipeId | string | null
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
      clarifyLabels: plan.clarifyLabels,
      planMeta: plan.planMeta,
    }
  }

  const activeRoleId: AgentRoleId = opts?.grammarOnly
    ? 'proofreader'
    : opts?.roleId ?? 'general'
  // Inbox already informed planning; reload for memory injection (cheap locally).
  const inbox = opts?.grammarOnly
    ? []
    : await loadHandoffInbox(activeRoleId, 'pending', 8)

  const contextWithTeachings = [
    ...teachingsToMemoryContext(prefs.teachings, {
      pinnedFacts: opts?.grammarOnly ? undefined : prefs.pinnedFacts,
      episodes: opts?.grammarOnly ? undefined : prefs.episodes,
      outputLanguage: prefs.outputLanguage,
      documentId,
      agentId: activeRoleId,
      grammarOnly: opts?.grammarOnly,
    }),
    ...handoffsToMemoryContext(inbox),
    ...(memoryContext ?? []),
  ]
  const steps: AgentStep[] = []
  const priorAnswers: string[] = []
  const sectionAnswers: string[] = []
  const citationBuckets: LibraryChatCitation[][] = []
  const followups: string[] = []
  let replanUsed = false
  let weakLookaheadUsed = false
  const runQueue = [...plan.tools]

  const runOne = async (tool: AgentToolId) => {
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
      return
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
        roleId: activeRoleId,
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
      if (
        !weakLookaheadUsed &&
        !opts?.recipeId &&
        !opts?.forceTools?.length &&
        isWeakAgentAnswer(result.answer)
      ) {
        weakLookaheadUsed = true
        try {
          const avoidPrefs: AgentPrefs = {
            ...prefs,
            disabledTools: [
              ...prefs.disabledTools,
              ...steps.map((step) => step.tool),
            ].filter((item, index, list) => list.indexOf(item) === index),
          }
          const rescue = await planAgentGoal(
            trimmed || 'continue with related tools',
            scope,
            documentId,
            avoidPrefs,
            {
              roleId: opts?.roleId,
              folderId: opts?.folderId,
            },
          )
          const attempted = new Set(steps.map((step) => step.tool))
          const alt = rescue.tools.find((candidate) => !attempted.has(candidate))
          if (alt && !runQueue.includes(alt)) {
            runQueue.push(alt)
          }
        } catch {
          // soft-fail lookahead is best-effort
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      steps.push({ tool, status: 'error', detail })
      if (replanUsed || opts?.recipeId) return
      replanUsed = true
      try {
        const avoidPrefs: AgentPrefs = {
          ...prefs,
          disabledTools: [...prefs.disabledTools, tool].filter(
            (item, index, list) => list.indexOf(item) === index,
          ),
        }
        const rescue = await planAgentGoal(trimmed || 'continue', scope, documentId, avoidPrefs, {
          roleId: opts?.roleId,
          folderId: opts?.folderId,
        })
        const attempted = new Set(steps.map((step) => step.tool))
        const alt = rescue.tools.find((candidate) => !attempted.has(candidate))
        if (alt) {
          await runOne(alt)
        }
      } catch {
        // soft-fail replan is best-effort
      }
    }
  }

  for (let i = 0; i < runQueue.length; i += 1) {
    const tool = runQueue[i]!
    await runOne(tool)
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

  // Soft auto-notify peer specialist after substantive specialist work.
  if (
    !opts?.grammarOnly &&
    activeRoleId !== 'general' &&
    steps.some((step) => step.status === 'ok') &&
    !plan.tools.includes('handoff')
  ) {
    const auto = await maybeAutoHandoffAfterRun({
      fromAgentId: activeRoleId,
      tools: steps.filter((step) => step.status === 'ok').map((step) => step.tool),
      answer,
      documentId,
      goal: trimmed,
    })
    if (auto) {
      followups.push(`handoff:${auto.toAgentId}`)
    }
  }

  const recipeFollowups = suggestFollowupRecipes(steps, scope, prefs.agents).map(
    (id) => `recipe:${id}`,
  )
  const phaseFollowups = phasesToFollowups(plan.phases)
  const upcomingPhases = (plan.phases ?? []).filter((p) => p.when === 'next' || p.when === 'later')

  return {
    answer,
    citations: mergeCitations(citationBuckets),
    steps,
    followups: [...phaseFollowups, ...followups, ...recipeFollowups].slice(0, 6),
    planMeta: plan.planMeta,
    phases: upcomingPhases.length ? upcomingPhases : plan.phases,
    nextPrefs,
  }
}

export function agentMemoryContext(
  messages: Array<{ role: 'user' | 'assistant'; text: string }>,
): Array<{ role: string; text: string }> {
  return documentChatContext(messages)
}
