import type { AgentToolId } from '@/lib/library/agent-prefs'
import type { AgentRecipeId } from '@/lib/library/agent-recipes'

/** Named specialist agents the user can enable/disable in Settings. */
export type AgentRoleId =
  | 'general'
  | 'proofreader'
  | 'librarian'
  | 'meeting'
  | 'study'
  | 'organizer'

export type AgentRolePrefs = {
  enabled: boolean
}

export type AgentRoleDefinition = {
  id: AgentRoleId
  /** i18n key: settings.agent.roles.<id>.label */
  labelKey: string
  /** i18n key: settings.agent.roles.<id>.hint */
  hintKey: string
  /** i18n key for dock tab short label */
  dockLabelKey: string
  /** i18n key for dock subtitle */
  dockTitleKey: string
  defaultEnabled: boolean
  /** Dedicated spell UI when true. */
  panel: 'agent' | 'spellcheck'
  /** Recipes owned by this role (hidden when role is off). */
  recipeIds: AgentRecipeId[]
  /** Tools this role is allowed to run (union across enabled roles). */
  tools: AgentToolId[]
}

export const AGENT_ROLE_IDS: AgentRoleId[] = [
  'general',
  'proofreader',
  'librarian',
  'meeting',
  'study',
  'organizer',
]

export const AGENT_ROLES: AgentRoleDefinition[] = [
  {
    id: 'general',
    labelKey: 'settings.agent.roles.general.label',
    hintKey: 'settings.agent.roles.general.hint',
    dockLabelKey: 'agent.roles.general.dock',
    dockTitleKey: 'agent.roles.general.dockTitle',
    defaultEnabled: true,
    panel: 'agent',
    recipeIds: [],
    tools: [
      'library_answer',
      'document_answer',
      'summarize',
      'outline',
      'explain',
      'simplify',
      'rewrite',
      'brief',
      'tasks',
      'takeaways',
      'similar',
      'citations',
      'compare_notes',
      'contradictions',
      'note_pulse',
      'title',
      'tone',
      'continuation',
      'handoff',
    ],
  },
  {
    id: 'proofreader',
    labelKey: 'settings.agent.roles.proofreader.label',
    hintKey: 'settings.agent.roles.proofreader.hint',
    dockLabelKey: 'agent.roles.proofreader.dock',
    dockTitleKey: 'agent.roles.proofreader.dockTitle',
    defaultEnabled: true,
    panel: 'spellcheck',
    recipeIds: ['spellcheck', 'polish'],
    tools: [
      'spellcheck',
      'grammar',
      'rewrite',
      'terminology',
      'terminology_library',
      'style',
      'tone',
      'handoff',
    ],
  },
  {
    id: 'librarian',
    labelKey: 'settings.agent.roles.librarian.label',
    hintKey: 'settings.agent.roles.librarian.hint',
    dockLabelKey: 'agent.roles.librarian.dock',
    dockTitleKey: 'agent.roles.librarian.dockTitle',
    defaultEnabled: true,
    panel: 'agent',
    recipeIds: ['daily_digest', 'weekly_review', 'files_digest'],
    tools: [
      'brief',
      'dates',
      'files_answer',
      'files_ingest',
      'tasks',
      'library_answer',
      'note_pulse',
      'library_report',
      'open_loops',
      'title',
      'handoff',
    ],
  },
  {
    id: 'meeting',
    labelKey: 'settings.agent.roles.meeting.label',
    hintKey: 'settings.agent.roles.meeting.hint',
    dockLabelKey: 'agent.roles.meeting.dock',
    dockTitleKey: 'agent.roles.meeting.dockTitle',
    defaultEnabled: true,
    panel: 'agent',
    recipeIds: ['meeting_wrap', 'note_to_template'],
    tools: [
      'meeting',
      'tasks',
      'action_items',
      'decisions',
      'commitments',
      'quotes',
      'mentions',
      'takeaways',
      'dates',
      'rank_tasks',
      'open_loops',
      'template_hints',
      'save_template',
      'outline',
      'handoff',
    ],
  },
  {
    id: 'study',
    labelKey: 'settings.agent.roles.study.label',
    hintKey: 'settings.agent.roles.study.hint',
    dockLabelKey: 'agent.roles.study.dock',
    dockTitleKey: 'agent.roles.study.dockTitle',
    defaultEnabled: true,
    panel: 'agent',
    recipeIds: ['study_pass', 'deep_read'],
    tools: [
      'outline',
      'glossary',
      'takeaways',
      'flashcards',
      'quiz',
      'section_summaries',
      'reading_plan',
      'tone',
      'revision',
      'explain',
      'simplify',
      'continuation',
      'handoff',
    ],
  },
  {
    id: 'organizer',
    labelKey: 'settings.agent.roles.organizer.label',
    hintKey: 'settings.agent.roles.organizer.hint',
    dockLabelKey: 'agent.roles.organizer.dock',
    dockTitleKey: 'agent.roles.organizer.dockTitle',
    defaultEnabled: true,
    panel: 'agent',
    recipeIds: ['cleanup', 'privacy_pass'],
    tools: [
      'organize',
      'wiki',
      'duplicates',
      'pii',
      'similar',
      'terminology',
      'terminology_library',
      'mentions',
      'title',
      'template_hints',
      'open_loops',
      'handoff',
    ],
  },
]

export const DEFAULT_AGENT_ROLES: Record<AgentRoleId, AgentRolePrefs> = {
  general: { enabled: true },
  proofreader: { enabled: true },
  librarian: { enabled: true },
  meeting: { enabled: true },
  study: { enabled: true },
  organizer: { enabled: true },
}

const ROLE_BY_ID = new Map(AGENT_ROLES.map((role) => [role.id, role]))

const RECIPE_OWNER = new Map<AgentRecipeId, AgentRoleId>()
for (const role of AGENT_ROLES) {
  for (const recipeId of role.recipeIds) {
    RECIPE_OWNER.set(recipeId, role.id)
  }
}

export function getAgentRole(id: AgentRoleId): AgentRoleDefinition {
  return ROLE_BY_ID.get(id) ?? AGENT_ROLES[0]!
}

export function isAgentRoleId(value: unknown): value is AgentRoleId {
  return typeof value === 'string' && (AGENT_ROLE_IDS as string[]).includes(value)
}

/** Map legacy dock persona ids. */
export function normalizeAgentRoleId(value: unknown): AgentRoleId {
  if (value === 'spellcheck') return 'proofreader'
  if (isAgentRoleId(value)) return value
  return 'general'
}

export function normalizeAgentRoles(raw: unknown): Record<AgentRoleId, AgentRolePrefs> {
  const out: Record<AgentRoleId, AgentRolePrefs> = { ...DEFAULT_AGENT_ROLES }
  if (!raw || typeof raw !== 'object') return out
  const input = raw as Partial<Record<AgentRoleId, Partial<AgentRolePrefs>>>
  for (const id of AGENT_ROLE_IDS) {
    const row = input[id]
    out[id] = {
      enabled: row?.enabled !== false,
    }
  }
  return out
}

export function isAgentRoleEnabled(
  agents: Record<AgentRoleId, AgentRolePrefs>,
  roleId: AgentRoleId,
): boolean {
  return agents[roleId]?.enabled !== false
}

export function enabledAgentRoles(
  agents: Record<AgentRoleId, AgentRolePrefs>,
): AgentRoleDefinition[] {
  return AGENT_ROLES.filter((role) => isAgentRoleEnabled(agents, role.id))
}

export function firstEnabledAgentRole(
  agents: Record<AgentRoleId, AgentRolePrefs>,
  preferred?: AgentRoleId | null,
): AgentRoleId | null {
  if (preferred && isAgentRoleEnabled(agents, preferred)) return preferred
  const first = enabledAgentRoles(agents)[0]
  return first?.id ?? null
}

export function recipeOwnerRole(recipeId: AgentRecipeId): AgentRoleId | null {
  return RECIPE_OWNER.get(recipeId) ?? null
}

export function isRecipeAllowedByAgents(
  recipeId: AgentRecipeId,
  agents: Record<AgentRoleId, AgentRolePrefs>,
): boolean {
  const owner = recipeOwnerRole(recipeId)
  if (!owner) return isAgentRoleEnabled(agents, 'general')
  return isAgentRoleEnabled(agents, owner)
}

/** Union of tools from every enabled specialist (+ always allow Q&A if general is on). */
export function toolsAllowedByAgents(
  agents: Record<AgentRoleId, AgentRolePrefs>,
): Set<AgentToolId> {
  const allowed = new Set<AgentToolId>()
  for (const role of enabledAgentRoles(agents)) {
    for (const tool of role.tools) allowed.add(tool)
  }
  return allowed
}

export function filterToolsByAgents(
  tools: AgentToolId[],
  agents: Record<AgentRoleId, AgentRolePrefs>,
): AgentToolId[] {
  const enabled = enabledAgentRoles(agents)
  if (enabled.length === 0) return []
  if (enabled.length === AGENT_ROLES.length) return tools
  const allowed = toolsAllowedByAgents(agents)
  return tools.filter((tool) => allowed.has(tool))
}

/** Preferred tools for the active dock role (boosts planning). */
export function preferredToolsForRole(roleId: AgentRoleId): AgentToolId[] {
  return getAgentRole(roleId).tools.slice(0, 6)
}
