import {
  addAgentTeachingBackend,
  clearAgentTeachingsBackend,
  getAgentPrefs,
  listAgentTeachings,
  removeAgentTeachingBackend,
  setAgentPrefsBackend,
} from '@/lib/db/api'
import type { AgentPrefs, AgentTeaching } from '@/lib/library/agent-prefs'
import { normalizeAgentPrefs } from '@/lib/library/agent-prefs'
import { isTauriRuntime } from '@/lib/tauri'

function toFrontendPrefs(
  prefs: Awaited<ReturnType<typeof getAgentPrefs>>,
  teachings: AgentTeaching[],
): AgentPrefs {
  return normalizeAgentPrefs({
    enabled: prefs.enabled,
    maxSteps: prefs.maxSteps,
    preferFast: prefs.preferFast,
    preferredTools: prefs.preferredTools,
    disabledTools: prefs.disabledTools,
    teachings,
  })
}

/** Load agent prefs + teachings from scribe-agent.db (Tauri) or return null offline. */
export async function loadAgentPrefsFromBackend(): Promise<AgentPrefs | null> {
  if (!isTauriRuntime()) return null
  try {
    const [prefs, teachings] = await Promise.all([getAgentPrefs(), listAgentTeachings()])
    return toFrontendPrefs(
      prefs,
      teachings.map((item) => ({
        id: item.id,
        text: item.text,
        createdAt: item.createdAt,
      })),
    )
  } catch {
    return null
  }
}

export async function saveAgentPrefsToBackend(prefs: AgentPrefs): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    await setAgentPrefsBackend({
      enabled: prefs.enabled,
      maxSteps: prefs.maxSteps,
      preferFast: prefs.preferFast,
      preferredTools: prefs.preferredTools,
      disabledTools: prefs.disabledTools,
    })
  } catch {
    // Soft-fail — local prefs still apply for the session.
  }
}

export async function teachAgentBackend(text: string): Promise<AgentTeaching | null> {
  if (!isTauriRuntime()) return null
  try {
    const row = await addAgentTeachingBackend(text)
    return { id: row.id, text: row.text, createdAt: row.createdAt }
  } catch {
    return null
  }
}

export async function forgetAgentTeachingBackend(id: string): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    await removeAgentTeachingBackend(id)
  } catch {
    // ignore
  }
}

export async function clearAgentTeachingsOnBackend(): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    await clearAgentTeachingsBackend()
  } catch {
    // ignore
  }
}
