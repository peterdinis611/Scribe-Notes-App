export const AGENT_TEACHINGS_MAX = 24
export const AGENT_TEACHING_MAX_LEN = 280
export const AGENT_PINNED_FACTS_MAX = 12
export const AGENT_EPISODES_MAX = 8
export const AGENT_DAILY_BUDGET_DEFAULT = 40

export type AgentToolId =
  | 'library_answer'
  | 'document_answer'
  | 'summarize'
  | 'outline'
  | 'tasks'
  | 'similar'
  | 'style'
  | 'flashcards'
  | 'takeaways'
  | 'dates'
  | 'meeting'
  | 'terminology'
  | 'wiki'
  | 'organize'
  | 'duplicates'
  | 'citations'
  | 'quiz'
  | 'revision'
  | 'spellcheck'
  | 'rewrite'
  | 'brief'

export type AgentMaxSteps = 1 | 2 | 3

export type AgentOutputLanguage = 'auto' | 'en' | 'sk'

export type AgentTeachingScope = 'global' | 'document'

export type AgentTeaching = {
  id: string
  text: string
  createdAt: number
  scope?: AgentTeachingScope
  /** When scope is document, bind teaching to this note. */
  documentId?: string | null
}

export type AgentPinnedFact = {
  id: string
  text: string
  createdAt: number
}

export type AgentEpisode = {
  id: string
  at: number
  goal: string
  summary: string
  documentId?: string | null
}

export type AgentPrefs = {
  /** Master switch — when false, agent UI/runtime refuses to run. */
  enabled: boolean
  /** Cap tool loop length (optimization). */
  maxSteps: AgentMaxSteps
  /** Prefer lighter tools; drop heavier ones when alternatives exist. */
  preferFast: boolean
  /** Boost these tools to the front of a plan when they match. */
  preferredTools: AgentToolId[]
  /** Never run these tools. */
  disabledTools: AgentToolId[]
  /** User-taught facts / standing instructions. */
  teachings: AgentTeaching[]
  /** Force answer language (injected into memory). */
  outputLanguage: AgentOutputLanguage
  /** When no clear intent, ask instead of defaulting to Q&A. */
  askWhenUncertain: boolean
  /** Max agent runs per local calendar day (0 = unlimited). */
  dailyRunBudget: number
  /** Skip heavy tools overnight (22:00–07:00 local). */
  quietHours: boolean
  /** Short pinned facts (projects, people, format). */
  pinnedFacts: AgentPinnedFact[]
  /** Recent run summaries for episodic context. */
  episodes: AgentEpisode[]
  /** Runs consumed today (local). */
  runsToday: number
  runsTodayDate: string
}

export const DEFAULT_AGENT_PREFS: AgentPrefs = {
  enabled: true,
  maxSteps: 3,
  preferFast: false,
  preferredTools: [],
  disabledTools: [],
  teachings: [],
  outputLanguage: 'auto',
  askWhenUncertain: true,
  dailyRunBudget: AGENT_DAILY_BUDGET_DEFAULT,
  quietHours: false,
  pinnedFacts: [],
  episodes: [],
  runsToday: 0,
  runsTodayDate: '',
}

const ALL_TOOLS: AgentToolId[] = [
  'library_answer',
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
  'duplicates',
  'citations',
  'quiz',
  'revision',
  'spellcheck',
  'rewrite',
  'brief',
]

const HEAVY_TOOLS = new Set<AgentToolId>([
  'flashcards',
  'style',
  'similar',
  'quiz',
  'revision',
  'duplicates',
  'citations',
  'meeting',
  'brief',
])

function isToolId(value: unknown): value is AgentToolId {
  return typeof value === 'string' && (ALL_TOOLS as string[]).includes(value)
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function normalizeTeachings(raw: unknown): AgentTeaching[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is AgentTeaching => {
      if (!item || typeof item !== 'object') return false
      return (
        typeof (item as AgentTeaching).id === 'string' &&
        typeof (item as AgentTeaching).text === 'string' &&
        typeof (item as AgentTeaching).createdAt === 'number'
      )
    })
    .map((item) => ({
      id: item.id,
      text: item.text.trim().slice(0, AGENT_TEACHING_MAX_LEN),
      createdAt: item.createdAt,
      scope: (item.scope === 'document' ? 'document' : 'global') as AgentTeachingScope,
      documentId: typeof item.documentId === 'string' ? item.documentId : null,
    }))
    .filter((item) => item.text.length > 0)
    .slice(0, AGENT_TEACHINGS_MAX)
}

function normalizePinned(raw: unknown): AgentPinnedFact[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is AgentPinnedFact => {
      if (!item || typeof item !== 'object') return false
      return (
        typeof (item as AgentPinnedFact).id === 'string' &&
        typeof (item as AgentPinnedFact).text === 'string' &&
        typeof (item as AgentPinnedFact).createdAt === 'number'
      )
    })
    .map((item) => ({
      id: item.id,
      text: item.text.trim().slice(0, AGENT_TEACHING_MAX_LEN),
      createdAt: item.createdAt,
    }))
    .filter((item) => item.text.length > 0)
    .slice(0, AGENT_PINNED_FACTS_MAX)
}

function normalizeEpisodes(raw: unknown): AgentEpisode[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is AgentEpisode => {
      if (!item || typeof item !== 'object') return false
      const row = item as AgentEpisode
      return (
        typeof row.id === 'string' &&
        typeof row.at === 'number' &&
        typeof row.goal === 'string' &&
        typeof row.summary === 'string'
      )
    })
    .map((item) => ({
      id: item.id,
      at: item.at,
      goal: item.goal.trim().slice(0, 160),
      summary: item.summary.trim().slice(0, 280),
      documentId: typeof item.documentId === 'string' ? item.documentId : null,
    }))
    .filter((item) => item.summary.length > 0)
    .slice(0, AGENT_EPISODES_MAX)
}

export function normalizeAgentPrefs(raw: unknown): AgentPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AGENT_PREFS }
  const input = raw as Partial<AgentPrefs>
  const maxSteps =
    input.maxSteps === 1 || input.maxSteps === 2 || input.maxSteps === 3
      ? input.maxSteps
      : DEFAULT_AGENT_PREFS.maxSteps

  const preferredTools = Array.isArray(input.preferredTools)
    ? input.preferredTools.filter(isToolId).slice(0, 10)
    : []
  const disabledTools = Array.isArray(input.disabledTools)
    ? input.disabledTools.filter(isToolId).slice(0, 10)
    : []

  const outputLanguage: AgentOutputLanguage =
    input.outputLanguage === 'en' || input.outputLanguage === 'sk' || input.outputLanguage === 'auto'
      ? input.outputLanguage
      : 'auto'

  const dailyRunBudget =
    typeof input.dailyRunBudget === 'number' && input.dailyRunBudget >= 0
      ? Math.min(200, Math.floor(input.dailyRunBudget))
      : AGENT_DAILY_BUDGET_DEFAULT

  const date = typeof input.runsTodayDate === 'string' ? input.runsTodayDate : ''
  const today = todayKey()
  const runsToday =
    date === today && typeof input.runsToday === 'number'
      ? Math.max(0, Math.floor(input.runsToday))
      : 0

  return {
    enabled: input.enabled !== false,
    maxSteps,
    preferFast: Boolean(input.preferFast),
    preferredTools,
    disabledTools,
    teachings: normalizeTeachings(input.teachings),
    outputLanguage,
    askWhenUncertain: input.askWhenUncertain !== false,
    dailyRunBudget,
    quietHours: Boolean(input.quietHours),
    pinnedFacts: normalizePinned(input.pinnedFacts),
    episodes: normalizeEpisodes(input.episodes),
    runsToday,
    runsTodayDate: date === today ? today : '',
  }
}

export function createTeaching(
  text: string,
  opts?: { scope?: AgentTeachingScope; documentId?: string | null },
): AgentTeaching | null {
  const trimmed = text.trim().replace(/\s+/g, ' ').slice(0, AGENT_TEACHING_MAX_LEN)
  if (trimmed.length < 2) return null
  return {
    id: `teach-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: trimmed,
    createdAt: Date.now(),
    scope: opts?.scope === 'document' ? 'document' : 'global',
    documentId: opts?.scope === 'document' ? opts.documentId ?? null : null,
  }
}

export function createPinnedFact(text: string): AgentPinnedFact | null {
  const trimmed = text.trim().replace(/\s+/g, ' ').slice(0, AGENT_TEACHING_MAX_LEN)
  if (trimmed.length < 2) return null
  return {
    id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: trimmed,
    createdAt: Date.now(),
  }
}

export function relevantTeachings(
  teachings: AgentTeaching[],
  documentId?: string | null,
): AgentTeaching[] {
  return teachings.filter((item) => {
    if (!item.scope || item.scope === 'global') return true
    if (item.scope === 'document') return Boolean(documentId && item.documentId === documentId)
    return true
  })
}

/** Inject teachings + pinned facts + episodes into chat memory. */
export function teachingsToMemoryContext(
  teachings: AgentTeaching[],
  extras?: {
    pinnedFacts?: AgentPinnedFact[]
    episodes?: AgentEpisode[]
    outputLanguage?: AgentOutputLanguage
    documentId?: string | null
  },
): Array<{ role: string; text: string }> {
  const blocks: string[] = []
  const scoped = relevantTeachings(teachings, extras?.documentId)
  if (scoped.length) {
    blocks.push(
      `Standing instructions for the local agent (follow when relevant):\n${scoped
        .map((item) => `• ${item.text}`)
        .join('\n')}`,
    )
  }
  if (extras?.pinnedFacts?.length) {
    blocks.push(
      `Pinned facts:\n${extras.pinnedFacts.map((item) => `• ${item.text}`).join('\n')}`,
    )
  }
  if (extras?.episodes?.length) {
    blocks.push(
      `Recent agent runs (episodic):\n${extras.episodes
        .slice(0, 4)
        .map((item) => `• ${item.summary}`)
        .join('\n')}`,
    )
  }
  if (extras?.outputLanguage === 'sk') {
    blocks.push('Always answer in Slovak.')
  } else if (extras?.outputLanguage === 'en') {
    blocks.push('Always answer in English.')
  }
  if (!blocks.length) return []
  return [{ role: 'user', text: blocks.join('\n\n') }]
}

/**
 * Reorder / filter a planned tool list using optimization prefs.
 * Preferred tools first, disabled removed, heavy tools dropped when preferFast or quiet hours.
 */
export function applyAgentOptimize(
  tools: AgentToolId[],
  prefs: Pick<
    AgentPrefs,
    'maxSteps' | 'preferFast' | 'preferredTools' | 'disabledTools' | 'quietHours'
  >,
): AgentToolId[] {
  const disabled = new Set(prefs.disabledTools)
  let next = tools.filter((tool) => !disabled.has(tool))

  const dropHeavy = prefs.preferFast || (prefs.quietHours && isQuietHourNow())
  if (dropHeavy) {
    const light = next.filter((tool) => !HEAVY_TOOLS.has(tool))
    if (light.length > 0) next = light
  }

  const preferred = prefs.preferredTools.filter((tool) => next.includes(tool))
  const rest = next.filter((tool) => !preferred.includes(tool))
  next = [...preferred, ...rest]

  const seen = new Set<AgentToolId>()
  const out: AgentToolId[] = []
  for (const tool of next) {
    if (seen.has(tool)) continue
    seen.add(tool)
    out.push(tool)
    if (out.length >= prefs.maxSteps) break
  }
  return out
}

export function isQuietHourNow(date = new Date()): boolean {
  const hour = date.getHours()
  return hour >= 22 || hour < 7
}

export function isHeavyAgentTool(tool: AgentToolId): boolean {
  return HEAVY_TOOLS.has(tool)
}

export function canRunAgentBudget(prefs: AgentPrefs): boolean {
  if (prefs.dailyRunBudget <= 0) return true
  const normalized = normalizeAgentPrefs(prefs)
  return normalized.runsToday < normalized.dailyRunBudget
}

export function bumpAgentRunCount(prefs: AgentPrefs): AgentPrefs {
  const today = todayKey()
  const base = normalizeAgentPrefs(prefs)
  const runsToday = base.runsTodayDate === today ? base.runsToday + 1 : 1
  return normalizeAgentPrefs({ ...base, runsToday, runsTodayDate: today })
}

export function pushAgentEpisode(
  prefs: AgentPrefs,
  episode: Omit<AgentEpisode, 'id' | 'at'> & { id?: string; at?: number },
): AgentPrefs {
  const next: AgentEpisode = {
    id: episode.id ?? `ep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: episode.at ?? Date.now(),
    goal: episode.goal,
    summary: episode.summary,
    documentId: episode.documentId ?? null,
  }
  return normalizeAgentPrefs({
    ...prefs,
    episodes: [next, ...prefs.episodes].slice(0, AGENT_EPISODES_MAX),
  })
}

export const AGENT_OPTIMIZABLE_TOOLS: AgentToolId[] = [
  'summarize',
  'outline',
  'tasks',
  'takeaways',
  'dates',
  'meeting',
  'terminology',
  'wiki',
  'organize',
  'duplicates',
  'citations',
  'quiz',
  'revision',
  'similar',
  'style',
  'flashcards',
  'spellcheck',
  'rewrite',
  'brief',
]
