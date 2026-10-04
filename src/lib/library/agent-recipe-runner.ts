import { runAgentGoal } from '@/lib/library/agent'
import type { AgentRecipeId } from '@/lib/library/agent-recipes'
import { normalizeAgentPrefs } from '@/lib/library/agent-prefs'
import { isRecipeAllowedByAgents, recipeOwnerRole } from '@/lib/library/agent-roles'
import { toast } from '@/lib/toast'
import { store } from '@/store/index'
import { setAgentPrefs } from '@/store/settingsSlice'
import i18n from '@/i18n'

/** Fire a recipe from the command palette (opens agent view separately). */
export async function runAgentRecipeFromPalette(recipeId: AgentRecipeId) {
  const state = store.getState()
  const prefs = normalizeAgentPrefs(state.settings.agentPrefs)
  if (!prefs.enabled) {
    toast.error(i18n.t('agent.errorTitle'), i18n.t('agent.disabled'))
    return
  }
  if (!isRecipeAllowedByAgents(recipeId, prefs.agents)) {
    toast.error(i18n.t('agent.errorTitle'), i18n.t('agent.roleDisabled'))
    return
  }
  const documentId = state.documents.activeDocumentId
  const libraryRecipes = new Set<AgentRecipeId>(['daily_digest', 'weekly_review', 'files_digest', 'cleanup'])
  const forceLibrary = libraryRecipes.has(recipeId)
  const scope = forceLibrary || !documentId ? 'library' : 'document'
  try {
    const result = await runAgentGoal(
      '',
      scope,
      forceLibrary ? null : documentId,
      undefined,
      prefs,
      { recipeId, roleId: recipeOwnerRole(recipeId) },
    )
    if (result.nextPrefs) store.dispatch(setAgentPrefs(result.nextPrefs))
    if (result.needsClarification) {
      toast.info(i18n.t('agent.clarifyPrompt'))
      return
    }
    const preview = (result.answer || '').replace(/\s+/g, ' ').slice(0, 140)
    toast.success(i18n.t('agent.recipesDone'), preview || i18n.t('agent.emptyResult'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    toast.error(i18n.t('agent.errorTitle'), message)
  }
}
