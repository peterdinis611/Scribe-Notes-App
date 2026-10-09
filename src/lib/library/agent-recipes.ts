import type { AgentToolId, CustomAgentRecipe } from '@/lib/library/agent-prefs'

export type AgentRecipeId =
  | 'daily_digest'
  | 'weekly_review'
  | 'meeting_wrap'
  | 'study_pass'
  | 'cleanup'
  | 'privacy_pass'
  | 'polish'
  | 'deep_read'
  | 'files_digest'
  | 'note_to_template'
  | 'spellcheck'

export type AgentRecipe = {
  id: AgentRecipeId
  /** i18n key under agent.recipes.* */
  labelKey: string
  /** Tools to run in order (capped by prefs.maxSteps later). */
  tools: AgentToolId[]
  /** Prefer document scope when true. */
  documentPreferred?: boolean
}

/** Runtime recipe — built-in or user-defined. */
export type ResolvedAgentRecipe = {
  id: string
  tools: AgentToolId[]
  documentPreferred?: boolean
  /** i18n key for built-ins; plain label for customs */
  labelKey?: string
  label?: string
  custom?: boolean
}

export const AGENT_RECIPES: AgentRecipe[] = [
  {
    id: 'daily_digest',
    labelKey: 'agent.recipes.dailyDigest',
    tools: ['brief'],
  },
  {
    id: 'weekly_review',
    labelKey: 'agent.recipes.weeklyReview',
    tools: ['library_report', 'terminology_library', 'dates'],
  },
  {
    id: 'meeting_wrap',
    labelKey: 'agent.recipes.meetingWrap',
    tools: ['meeting', 'decisions', 'open_loops', 'rank_tasks'],
    documentPreferred: true,
  },
  {
    id: 'note_to_template',
    labelKey: 'agent.recipes.noteToTemplate',
    tools: ['template_hints', 'outline', 'save_template'],
    documentPreferred: true,
  },
  {
    id: 'study_pass',
    labelKey: 'agent.recipes.studyPass',
    tools: ['outline', 'reading_plan', 'quiz'],
    documentPreferred: true,
  },
  {
    id: 'deep_read',
    labelKey: 'agent.recipes.deepRead',
    tools: ['section_summaries', 'tone', 'takeaways', 'flashcards'],
    documentPreferred: true,
  },
  {
    id: 'files_digest',
    labelKey: 'agent.recipes.filesDigest',
    tools: ['files_answer'],
  },
  {
    id: 'cleanup',
    labelKey: 'agent.recipes.cleanup',
    tools: ['duplicates', 'title', 'organize'],
  },
  {
    id: 'privacy_pass',
    labelKey: 'agent.recipes.privacyPass',
    tools: ['pii', 'duplicates', 'organize'],
  },
  {
    id: 'spellcheck',
    labelKey: 'agent.recipes.spellcheck',
    tools: ['spellcheck'],
    documentPreferred: true,
  },
  {
    id: 'polish',
    labelKey: 'agent.recipes.polish',
    tools: ['spellcheck', 'grammar', 'tone'],
    documentPreferred: true,
  },
]

export function getAgentRecipe(id: string): AgentRecipe | undefined {
  return AGENT_RECIPES.find((recipe) => recipe.id === id)
}

export function resolveAgentRecipe(
  id: string,
  customRecipes: CustomAgentRecipe[] = [],
): ResolvedAgentRecipe | undefined {
  const builtIn = getAgentRecipe(id)
  if (builtIn) {
    return {
      id: builtIn.id,
      tools: builtIn.tools,
      documentPreferred: builtIn.documentPreferred,
      labelKey: builtIn.labelKey,
    }
  }
  const custom = customRecipes.find((recipe) => recipe.id === id)
  if (!custom) return undefined
  return {
    id: custom.id,
    tools: custom.tools,
    documentPreferred: custom.documentPreferred,
    label: custom.label,
    custom: true,
  }
}
