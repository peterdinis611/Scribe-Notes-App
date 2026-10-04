import type { AgentToolId } from '@/lib/library/agent-prefs'

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

export const AGENT_RECIPES: AgentRecipe[] = [
  {
    id: 'daily_digest',
    labelKey: 'agent.recipes.dailyDigest',
    tools: ['brief'],
  },
  {
    id: 'weekly_review',
    labelKey: 'agent.recipes.weeklyReview',
    tools: ['brief', 'dates'],
  },
  {
    id: 'meeting_wrap',
    labelKey: 'agent.recipes.meetingWrap',
    tools: ['meeting', 'decisions', 'commitments', 'rank_tasks'],
    documentPreferred: true,
  },
  {
    id: 'note_to_template',
    labelKey: 'agent.recipes.noteToTemplate',
    tools: ['outline', 'save_template'],
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
    tools: ['section_summaries', 'glossary', 'takeaways', 'flashcards'],
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
    tools: ['duplicates', 'wiki', 'organize'],
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
    tools: ['spellcheck', 'grammar', 'terminology'],
    documentPreferred: true,
  },
]

export function getAgentRecipe(id: string): AgentRecipe | undefined {
  return AGENT_RECIPES.find((recipe) => recipe.id === id)
}
