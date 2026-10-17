import type { AgentRoleId } from '@/lib/library/agent-roles'
import type { AgentToolId } from '@/lib/library/agent-prefs'
import { kvGetJson, kvRemove, kvSetJson } from '@/lib/storage/kv'

const STORAGE_KEY = 'scribe-agent-plan-feedback'
const MAX_ENTRIES = 48

export type PlanFeedbackOutcome = 'apply' | 'dismiss'

export type PlanFeedbackEntry = {
  goal: string
  tools: AgentToolId[]
  outcome: PlanFeedbackOutcome
  at: number
  roleId?: AgentRoleId
  source?: string
}

function readEntries(): PlanFeedbackEntry[] {
  const parsed = kvGetJson<PlanFeedbackEntry[]>(STORAGE_KEY)
  if (!Array.isArray(parsed)) return []
  return parsed.filter(
    (item) =>
      item &&
      typeof item.goal === 'string' &&
      Array.isArray(item.tools) &&
      (item.outcome === 'apply' || item.outcome === 'dismiss'),
  )
}

function writeEntries(entries: PlanFeedbackEntry[]) {
  kvSetJson(STORAGE_KEY, entries.slice(0, MAX_ENTRIES))
}

export function recordPlanFeedback(input: {
  goal: string
  tools: AgentToolId[]
  outcome: PlanFeedbackOutcome
  roleId?: AgentRoleId | null
  source?: string | null
}): void {
  const goal = input.goal.trim().slice(0, 240)
  const tools = input.tools.filter(Boolean).slice(0, 6)
  if (!goal || tools.length === 0) return
  const next: PlanFeedbackEntry = {
    goal,
    tools,
    outcome: input.outcome,
    at: Date.now(),
    roleId: input.roleId ?? undefined,
    source: input.source ?? undefined,
  }
  const prior = readEntries().filter(
    (item) => !(item.goal === next.goal && item.outcome === next.outcome && item.at > Date.now() - 8_000),
  )
  writeEntries([next, ...prior])
}

/** Successful apply plans — tool sets passed to JEPA as soft boosts. */
export function listSuccessfulPlanTools(limit = 24): string[][] {
  return readEntries()
    .filter((item) => item.outcome === 'apply')
    .slice(0, limit)
    .map((item) => item.tools.map(String))
}

export function clearPlanFeedback(): void {
  kvRemove(STORAGE_KEY)
}
