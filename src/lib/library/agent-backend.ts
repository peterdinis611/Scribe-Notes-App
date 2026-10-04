import {
  addAgentTeachingBackend,
  clearAgentTeachingsBackend,
  getAgentPrefs,
  listAgentRoleStates,
  listAgentTeachings,
  removeAgentTeachingBackend,
  setAgentPrefsBackend,
  setAgentRoleStatesBackend,
} from '@/lib/db/api'
import type { AgentPrefs, AgentRoleId, AgentTeaching } from '@/lib/library/agent-prefs'
import { normalizeAgentPrefs } from '@/lib/library/agent-prefs'
import { AGENT_ROLE_IDS, type AgentRolePrefs } from '@/lib/library/agent-roles'
import { isTauriRuntime } from '@/lib/tauri'

function toFrontendPrefs(
  prefs: Awaited<ReturnType<typeof getAgentPrefs>>,
  teachings: AgentTeaching[],
  agents: Record<AgentRoleId, AgentRolePrefs>,
  local: AgentPrefs,
): AgentPrefs {
  return normalizeAgentPrefs({
    ...local,
    enabled: prefs.enabled,
    agents,
    maxSteps: prefs.maxSteps,
    preferFast: prefs.preferFast,
    preferredTools: prefs.preferredTools,
    disabledTools: prefs.disabledTools,
    teachings,
  })
}

function mapTeaching(row: {
  id: string
  text: string
  createdAt: number
  topic?: 'general' | 'grammar' | string
  agentId?: string
}): AgentTeaching {
  const topic = row.topic === 'grammar' ? ('grammar' as const) : ('general' as const)
  const agentId = (AGENT_ROLE_IDS as string[]).includes(row.agentId ?? '')
    ? (row.agentId as AgentRoleId)
    : topic === 'grammar'
      ? 'proofreader'
      : 'general'
  return {
    id: row.id,
    text: row.text,
    createdAt: row.createdAt,
    topic,
    agentId,
  }
}

/** Load agent prefs + teachings from scribe-agent.db (Tauri) or return null offline. */
export async function loadAgentPrefsFromBackend(): Promise<AgentPrefs | null> {
  if (!isTauriRuntime()) return null
  try {
    const { readAgentPrefs } = await import('@/store/persistence')
    const local = readAgentPrefs()
    const [prefs, teachings, roleStates] = await Promise.all([
      getAgentPrefs(),
      listAgentTeachings(),
      listAgentRoleStates().catch(() => []),
    ])
    const agents = { ...local.agents }
    for (const state of roleStates) {
      if ((AGENT_ROLE_IDS as string[]).includes(state.agentId)) {
        agents[state.agentId as AgentRoleId] = { enabled: state.enabled }
      }
    }
    return toFrontendPrefs(
      prefs,
      teachings.map(mapTeaching),
      agents,
      local,
    )
  } catch {
    return null
  }
}

export async function saveAgentPrefsToBackend(prefs: AgentPrefs): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    await Promise.all([
      setAgentPrefsBackend({
        enabled: prefs.enabled,
        maxSteps: prefs.maxSteps,
        preferFast: prefs.preferFast,
        preferredTools: prefs.preferredTools,
        disabledTools: prefs.disabledTools,
      }),
      setAgentRoleStatesBackend(
        AGENT_ROLE_IDS.map((id) => ({
          agentId: id,
          enabled: prefs.agents[id]?.enabled !== false,
        })),
      ),
    ])
  } catch {
    // Soft-fail — local prefs still apply for the session.
  }
}

export async function teachAgentBackend(
  text: string,
  topic?: 'general' | 'grammar',
  agentId?: AgentRoleId | null,
): Promise<AgentTeaching | null> {
  if (!isTauriRuntime()) return null
  try {
    const row = await addAgentTeachingBackend(text, topic, agentId)
    return mapTeaching({ ...row, topic: row.topic === 'grammar' || topic === 'grammar' ? 'grammar' : 'general' })
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

export async function clearAgentTeachingsOnBackend(agentId?: AgentRoleId | null): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    await clearAgentTeachingsBackend(agentId)
  } catch {
    // ignore
  }
}
