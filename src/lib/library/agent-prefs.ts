export const AGENT_TEACHINGS_MAX = 24
export const AGENT_TEACHING_MAX_LEN = 280

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

export type AgentMaxSteps = 1 | 2 | 3

export type AgentTeaching = {
  id: string
  text: string
  createdAt: number
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
}

export const DEFAULT_AGENT_PREFS: AgentPrefs = {
  enabled: true,
  maxSteps: 3,
  preferFast: false,
  preferredTools: [],
  disabledTools: [],
  teachings: [],
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
]

const HEAVY_TOOLS = new Set<AgentToolId>(['flashcards', 'style', 'similar'])

function isToolId(value: unknown): value is AgentToolId {
  return typeof value === 'string' && (ALL_TOOLS as string[]).includes(value)
}

export function normalizeAgentPrefs(raw: unknown): AgentPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AGENT_PREFS }
  const input = raw as Partial<AgentPrefs>
  const maxSteps =
    input.maxSteps === 1 || input.maxSteps === 2 || input.maxSteps === 3
      ? input.maxSteps
      : DEFAULT_AGENT_PREFS.maxSteps

  const preferredTools = Array.isArray(input.preferredTools)
    ? input.preferredTools.filter(isToolId).slice(0, 8)
    : []
  const disabledTools = Array.isArray(input.disabledTools)
    ? input.disabledTools.filter(isToolId).slice(0, 8)
    : []
  const teachings = Array.isArray(input.teachings)
    ? input.teachings
        .filter((item): item is AgentTeaching => {
          if (!item || typeof item !== 'object') return false
          return (
            typeof item.id === 'string' &&
            typeof item.text === 'string' &&
            typeof item.createdAt === 'number'
          )
        })
        .map((item) => ({
          id: item.id,
          text: item.text.trim().slice(0, AGENT_TEACHING_MAX_LEN),
          createdAt: item.createdAt,
        }))
        .filter((item) => item.text.length > 0)
        .slice(0, AGENT_TEACHINGS_MAX)
    : []

  return {
    enabled: input.enabled !== false,
    maxSteps,
    preferFast: Boolean(input.preferFast),
    preferredTools,
    disabledTools,
    teachings,
  }
}

export function createTeaching(text: string): AgentTeaching | null {
  const trimmed = text.trim().replace(/\s+/g, ' ').slice(0, AGENT_TEACHING_MAX_LEN)
  if (trimmed.length < 2) return null
  return {
    id: `teach-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: trimmed,
    createdAt: Date.now(),
  }
}

/** Inject teachings into chat memory so Q&A tools can bias toward them. */
export function teachingsToMemoryContext(
  teachings: AgentTeaching[],
): Array<{ role: string; text: string }> {
  if (!teachings.length) return []
  const lines = teachings.map((item) => `• ${item.text}`).join('\n')
  return [
    {
      role: 'user',
      text: `Standing instructions for the local agent (follow when relevant):\n${lines}`,
    },
  ]
}

/**
 * Reorder / filter a planned tool list using optimization prefs.
 * Preferred tools first, disabled removed, heavy tools dropped when preferFast.
 */
export function applyAgentOptimize(
  tools: AgentToolId[],
  prefs: Pick<AgentPrefs, 'maxSteps' | 'preferFast' | 'preferredTools' | 'disabledTools'>,
): AgentToolId[] {
  const disabled = new Set(prefs.disabledTools)
  let next = tools.filter((tool) => !disabled.has(tool))

  if (prefs.preferFast) {
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

export function isHeavyAgentTool(tool: AgentToolId): boolean {
  return HEAVY_TOOLS.has(tool)
}

export const AGENT_OPTIMIZABLE_TOOLS: AgentToolId[] = [
  'summarize',
  'outline',
  'tasks',
  'takeaways',
  'similar',
  'style',
  'flashcards',
]
