import { nlpAgentDocumentBrief, nlpStatus } from '@/lib/db/nlp-api'
import { canRunAgentBudget, normalizeAgentPrefs } from '@/lib/library/agent-prefs'
import { isAgentRoleEnabled } from '@/lib/library/agent-roles'
import { applyAgentAnswer } from '@/lib/editor/insert-ai-answer'
import { toast } from '@/lib/toast'
import { store } from '@/store/index'
import { setAgentPrefs } from '@/store/settingsSlice'
import { bumpAgentRunCount } from '@/lib/library/agent-prefs'
import i18n from '@/i18n'

const DELAY_MS = 4500
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const lastBriefAt = new Map<string, number>()
const COOLDOWN_MS = 5 * 60_000

/** Debounced light agent brief after a document save (pref-gated). */
export function scheduleAgentAutoBrief(documentId: string) {
  const existing = timers.get(documentId)
  if (existing) clearTimeout(existing)
  timers.set(
    documentId,
    setTimeout(() => {
      timers.delete(documentId)
      void runAutoBrief(documentId)
    }, DELAY_MS),
  )
}

async function runAutoBrief(documentId: string) {
  const prefs = normalizeAgentPrefs(store.getState().settings.agentPrefs)
  if (!prefs.enabled || !prefs.autoRunOnSave) return
  if (!isAgentRoleEnabled(prefs.agents, 'librarian') && !isAgentRoleEnabled(prefs.agents, 'general')) {
    return
  }
  if (!canRunAgentBudget(prefs)) return

  const last = lastBriefAt.get(documentId) ?? 0
  if (Date.now() - last < COOLDOWN_MS) return

  try {
    const status = await nlpStatus()
    if (!status.enabled || !status.sidecarOk) return
    const brief = await nlpAgentDocumentBrief({
      documentId,
      goal: 'Light brief after save',
      tools: ['summarize', 'tasks', 'takeaways'],
      limit: 5,
    })
    if (!brief.count || !brief.answer?.trim()) return
    lastBriefAt.set(documentId, Date.now())
    store.dispatch(setAgentPrefs(bumpAgentRunCount(prefs)))
    const preview = brief.answer.replace(/\s+/g, ' ').slice(0, 140)
    const answer = brief.answer
    toast.success(i18n.t('agent.autoBriefToast'), preview, {
      duration: 10_000,
      action: {
        label: i18n.t('agent.autoBriefInsert'),
        onClick: () => {
          const activeId = store.getState().documents.activeDocumentId
          if (activeId !== documentId) {
            toast.info(i18n.t('agent.autoBriefWrongDoc'))
            return
          }
          const ok = applyAgentAnswer(answer, 'callout', {
            sourceTitle: i18n.t('agent.brandBadge'),
          })
          if (ok) toast.success(i18n.t('agent.appliedToNote'))
          else toast.error(i18n.t('agent.applyFailed'))
        },
      },
    })
  } catch {
    // Soft-fail — never block editing.
  }
}
