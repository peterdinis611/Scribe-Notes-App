/**
 * Agent plan phases — sync helpers for FE.
 * Canonical implementation: `crates/scribe-core/src/nlp/agent_phases.rs`
 * (Tauri: encode_phase_followup / decode_phase_followup / normalize_plan_phases / …).
 */
import type { AgentToolId } from '@/lib/library/agent-prefs'

export type AgentPhaseWhen = 'now' | 'next' | 'later'

export type AgentPlanPhase = {
  when: AgentPhaseWhen
  goal: string
  tools: AgentToolId[]
  reason?: string
}

const PHASE_PREFIX = 'phase:'

/** Encode a next/later phase as a followup chip token. */
export function encodePhaseFollowup(phase: AgentPlanPhase): string | null {
  if (phase.when === 'now') return null
  if (!phase.tools.length) return null
  const payload = {
    when: phase.when,
    goal: phase.goal.slice(0, 160),
    tools: phase.tools.slice(0, 4),
    reason: phase.reason?.slice(0, 80),
  }
  return `${PHASE_PREFIX}${phase.when}:${encodeURIComponent(JSON.stringify(payload))}`
}

export function isPhaseFollowup(token: string): boolean {
  return token.startsWith(PHASE_PREFIX)
}

export function decodePhaseFollowup(token: string): AgentPlanPhase | null {
  if (!isPhaseFollowup(token)) return null
  const rest = token.slice(PHASE_PREFIX.length)
  const colon = rest.indexOf(':')
  if (colon < 0) return null
  const when = rest.slice(0, colon) as AgentPhaseWhen
  if (when !== 'next' && when !== 'later') return null
  const body = rest.slice(colon + 1)
  try {
    const parsed = JSON.parse(decodeURIComponent(body)) as {
      when?: string
      goal?: string
      tools?: string[]
      reason?: string
    }
    const tools = (parsed.tools ?? []).filter(Boolean) as AgentToolId[]
    if (!tools.length) return null
    return {
      when,
      goal: String(parsed.goal || '').trim() || tools.join(' + '),
      tools,
      reason: parsed.reason,
    }
  } catch {
    return null
  }
}

/** True when a successful tool answer is empty or a soft "nothing found" stub. */
export function isWeakAgentAnswer(answer: string | undefined | null): boolean {
  const text = (answer ?? '').trim()
  if (!text) return true
  if (text.length < 12) return true
  return /^(no |none |nothing |nenájden|nenajden|žiadn|ziadn)/i.test(text)
}

export function phasesToFollowups(phases: AgentPlanPhase[] | undefined | null): string[] {
  if (!phases?.length) return []
  const out: string[] = []
  for (const phase of phases) {
    if (phase.when === 'now') continue
    const token = encodePhaseFollowup(phase)
    if (token) out.push(token)
  }
  return out
}

export function normalizePlanPhases(
  raw: unknown,
  fallbackTools: AgentToolId[],
  goal: string,
): AgentPlanPhase[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    if (!fallbackTools.length) return []
    return [{ when: 'now', goal, tools: fallbackTools, reason: 'Run immediately' }]
  }
  const out: AgentPlanPhase[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const when = String(row.when || '').toLowerCase()
    if (when !== 'now' && when !== 'next' && when !== 'later') continue
    const tools = (Array.isArray(row.tools) ? row.tools : [])
      .map((t) => String(t).trim())
      .filter(Boolean) as AgentToolId[]
    if (!tools.length) continue
    out.push({
      when: when as AgentPhaseWhen,
      goal: String(row.goal || '').trim() || tools.join(' + '),
      tools,
      reason: row.reason ? String(row.reason) : undefined,
    })
  }
  if (!out.some((p) => p.when === 'now') && fallbackTools.length) {
    out.unshift({ when: 'now', goal, tools: fallbackTools, reason: 'Run immediately' })
  }
  return out
}

export function nowToolsFromPhases(
  phases: AgentPlanPhase[] | undefined,
  fallback: AgentToolId[],
): AgentToolId[] {
  const now = phases?.find((p) => p.when === 'now')
  return now?.tools?.length ? now.tools : fallback
}
