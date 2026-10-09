import {
  listAgentHandoffs,
  sendAgentHandoff,
  setAgentHandoffStatus,
  type AgentBackendHandoff,
} from '@/lib/db/api'
import type { AgentRoleId } from '@/lib/library/agent-roles'
import { AGENT_ROLE_IDS, isAgentRoleId, normalizeAgentRoleId } from '@/lib/library/agent-roles'
import { isTauriRuntime } from '@/lib/tauri'

const SUMMARY_MAX = 600

/** Default receiver when the goal does not name a target. */
export const DEFAULT_HANDOFF_TARGET: Partial<Record<AgentRoleId, AgentRoleId>> = {
  meeting: 'organizer',
  study: 'librarian',
  proofreader: 'general',
  organizer: 'meeting',
  librarian: 'general',
  general: 'organizer',
}

const TARGET_ALIASES: Record<string, AgentRoleId> = {
  general: 'general',
  default: 'general',
  main: 'general',
  proofreader: 'proofreader',
  spellcheck: 'proofreader',
  spell: 'proofreader',
  grammar: 'proofreader',
  librarian: 'librarian',
  library: 'librarian',
  wiki: 'librarian',
  meeting: 'meeting',
  meetings: 'meeting',
  study: 'study',
  learning: 'study',
  organizer: 'organizer',
  organise: 'organizer',
  organize: 'organizer',
  tasks: 'organizer',
}

export type ParsedHandoffGoal = {
  toAgentId: AgentRoleId
  summary: string
}

/** Extract `@organizer …`, `handoff to meeting: …`, `pošli proofreaderovi …`. */
export function parseHandoffGoal(
  goal: string,
  fromAgentId: AgentRoleId,
): ParsedHandoffGoal | null {
  const trimmed = goal.trim()
  if (!trimmed) return null

  const patterns: RegExp[] = [
    /^(?:handoff|delegate|pass|send|tell|forward|pošli|posli|odovzdaj|predaj)\s+(?:to\s+|pre\s+)?([a-zA-ZáäčďéíľĺňóôŕšťúýžÁÄČĎÉÍĽĹŇÓÔŔŠŤÚÝŽ_]+)\s*(?:ovi|ovi:|:|\s+)\s*(.+)$/iu,
    /^@([a-zA-Z_]+)\s+(.+)$/u,
    /^(?:to|pre)\s+([a-zA-Z_]+)\s*[:\-]\s*(.+)$/iu,
  ]

  let sawExplicitTarget = false
  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (!match) continue
    let rawTarget = match[1]?.trim().toLowerCase() ?? ''
    // Slovak dative / soft suffixes: organizerovi, proofreaderovi, meetingu…
    rawTarget = rawTarget.replace(/(ovi|emu|u|a)$/u, '')
    const summary = (match[2] ?? '').trim()
    const mapped = TARGET_ALIASES[rawTarget] ?? (isAgentRoleId(rawTarget) ? rawTarget : null)
    if (!mapped || summary.length < 2) continue
    sawExplicitTarget = true
    if (mapped === fromAgentId) return null
    return { toAgentId: mapped, summary: summary.slice(0, SUMMARY_MAX) }
  }

  // Fallback only when no explicit target was named.
  if (sawExplicitTarget) return null
  const fallback = DEFAULT_HANDOFF_TARGET[fromAgentId]
  if (!fallback || fallback === fromAgentId) return null
  if (
    !/\b(handoff|delegate|pass|send|tell|forward|pošli|posli|odovzdaj|predaj|inbox)\b/i.test(
      trimmed,
    )
  ) {
    return null
  }
  return { toAgentId: fallback, summary: trimmed.slice(0, SUMMARY_MAX) }
}

export async function sendHandoffBetweenAgents(input: {
  fromAgentId: AgentRoleId
  toAgentId: AgentRoleId
  summary: string
  documentId?: string | null
  payload?: Record<string, unknown> | null
}): Promise<AgentBackendHandoff | null> {
  if (!isTauriRuntime()) return null
  const summary = input.summary.trim().replace(/\s+/g, ' ').slice(0, SUMMARY_MAX)
  if (summary.length < 2 || input.fromAgentId === input.toAgentId) return null
  try {
    return await sendAgentHandoff({
      fromAgentId: input.fromAgentId,
      toAgentId: input.toAgentId,
      summary,
      documentId: input.documentId,
      payloadJson: input.payload ? JSON.stringify(input.payload) : null,
    })
  } catch {
    return null
  }
}

export async function loadHandoffInbox(
  toAgentId: AgentRoleId,
  status: 'pending' | 'acknowledged' | 'dismissed' | null = 'pending',
  limit = 12,
): Promise<AgentBackendHandoff[]> {
  if (!isTauriRuntime()) return []
  try {
    return await listAgentHandoffs(toAgentId, status, limit)
  } catch {
    return []
  }
}

export async function acknowledgeHandoff(id: string): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    await setAgentHandoffStatus(id, 'acknowledged')
  } catch {
    // ignore
  }
}

export async function dismissHandoff(id: string): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    await setAgentHandoffStatus(id, 'dismissed')
  } catch {
    // ignore
  }
}

/** Inject pending inbox into agent memory context. */
export function handoffsToMemoryContext(
  handoffs: AgentBackendHandoff[],
): Array<{ role: string; text: string }> {
  const pending = handoffs.filter((item) => item.status === 'pending').slice(0, 6)
  if (!pending.length) return []
  const body = pending
    .map((item) => {
      const doc = item.documentId ? ` [doc:${item.documentId}]` : ''
      return `• From ${item.fromAgentId}: ${item.summary}${doc}`
    })
    .join('\n')
  return [
    {
      role: 'system',
      text: `Pending handoffs from other local agents (use when relevant; do not invent extra tasks):\n${body}`,
    },
  ]
}

/** After a specialist run, optionally notify a peer with a distilled summary. */
export async function maybeAutoHandoffAfterRun(input: {
  fromAgentId: AgentRoleId
  tools: string[]
  answer: string
  documentId?: string | null
  goal: string
}): Promise<AgentBackendHandoff | null> {
  const toAgentId = DEFAULT_HANDOFF_TARGET[input.fromAgentId]
  if (!toAgentId || toAgentId === input.fromAgentId) return null

  const triggers: Partial<Record<AgentRoleId, string[]>> = {
    meeting: ['meeting', 'tasks', 'action_items', 'decisions', 'commitments'],
    study: ['flashcards', 'quiz', 'reading_plan', 'glossary'],
    proofreader: ['spellcheck', 'grammar', 'rewrite'],
    organizer: ['organize', 'duplicates', 'pii'],
    librarian: ['brief', 'library_report', 'open_loops'],
  }
  const needed = triggers[input.fromAgentId] ?? []
  if (!needed.some((tool) => input.tools.includes(tool))) return null

  const answer = input.answer.trim().replace(/\s+/g, ' ')
  if (answer.length < 40) return null

  // Avoid flooding: skip if goal already was an explicit handoff.
  if (parseHandoffGoal(input.goal, input.fromAgentId)) return null

  const summary = `${input.fromAgentId} → ${toAgentId}: ${answer.slice(0, 280)}`
  return sendHandoffBetweenAgents({
    fromAgentId: input.fromAgentId,
    toAgentId,
    summary,
    documentId: input.documentId,
    payload: { tools: input.tools, goal: input.goal.slice(0, 160), auto: true },
  })
}

export function resolveHandoffRole(value: unknown): AgentRoleId {
  return normalizeAgentRoleId(value)
}

export function knownHandoffTargets(fromAgentId: AgentRoleId): AgentRoleId[] {
  return AGENT_ROLE_IDS.filter((id) => id !== fromAgentId)
}
