import type { AgentToolId } from '@/lib/library/agent-prefs'

export type AgentRecipeId =
  | 'weekly_review'
  | 'meeting_wrap'
  | 'study_pass'
  | 'cleanup'
  | 'polish'

export type AgentRecipe = {
  id: AgentRecipeId
  /** i18n key under agent.recipes.* */
  labelKey: string
  /** Tools to run in order (capped by prefs.maxSteps later). */
  tools: AgentToolId[]
  /** Prefer document scope when true. */
  documentPreferred?: boolean
}

export const AGENT_RECIPES: AgentRecipe[] = [
  {
    id: 'weekly_review',
    labelKey: 'agent.recipes.weeklyReview',
    tools: ['dates', 'tasks', 'takeaways'],
  },
  {
    id: 'meeting_wrap',
    labelKey: 'agent.recipes.meetingWrap',
    tools: ['meeting', 'tasks', 'takeaways'],
    documentPreferred: true,
  },
  {
    id: 'study_pass',
    labelKey: 'agent.recipes.studyPass',
    tools: ['outline', 'quiz', 'flashcards'],
    documentPreferred: true,
  },
  {
    id: 'cleanup',
    labelKey: 'agent.recipes.cleanup',
    tools: ['duplicates', 'wiki', 'organize'],
  },
  {
    id: 'polish',
    labelKey: 'agent.recipes.polish',
    tools: ['spellcheck', 'terminology', 'style'],
    documentPreferred: true,
  },
]

export function getAgentRecipe(id: string): AgentRecipe | undefined {
  return AGENT_RECIPES.find((recipe) => recipe.id === id)
}
