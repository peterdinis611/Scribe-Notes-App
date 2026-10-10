import { runAgentGoal } from '@/lib/library/agent'
import {
  bumpAgentRunCount,
  canRunAgentBudget,
  isQuietHourNow,
  normalizeAgentPrefs,
  type AgentDigestSchedule,
  type AgentPrefs,
} from '@/lib/library/agent-prefs'
import { isAgentRoleEnabled } from '@/lib/library/agent-roles'
import { toast } from '@/lib/toast'
import { store } from '@/store/index'
import { setAgentPrefs } from '@/store/settingsSlice'
import i18n from '@/i18n'

const TICK_MS = 60_000
let timer: ReturnType<typeof setInterval> | null = null
let running = false

function todayKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function localHm(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function weekdayKey(date = new Date()): number {
  return date.getDay() // 0 = Sun
}

export function shouldRunDigestNow(schedule: AgentDigestSchedule, now = new Date()): boolean {
  if (!schedule.enabled) return false
  const hm = localHm(now)
  if (hm !== schedule.timeLocal) return false
  const today = todayKey(now)
  if (schedule.lastRunDate === today) return false
  if (schedule.period === 'week' && weekdayKey(now) !== schedule.weekday) return false
  return true
}

/** App opened after the scheduled time — still run once today. */
export function shouldCatchUpDigest(schedule: AgentDigestSchedule, now = new Date()): boolean {
  if (!schedule.enabled) return false
  const today = todayKey(now)
  if (schedule.lastRunDate === today) return false
  if (schedule.period === 'week' && weekdayKey(now) !== schedule.weekday) return false
  return localHm(now) >= schedule.timeLocal
}

async function tick(opts?: { catchUp?: boolean }) {
  if (running) return
  const prefs = normalizeAgentPrefs(store.getState().settings.agentPrefs)
  if (!prefs.enabled || !prefs.digestSchedule.enabled) return
  const due = shouldRunDigestNow(prefs.digestSchedule)
  const catchUp = Boolean(opts?.catchUp) && shouldCatchUpDigest(prefs.digestSchedule)
  if (!due && !catchUp) return
  if (prefs.quietHours && isQuietHourNow()) return
  if (!canRunAgentBudget(prefs)) return
  if (
    !isAgentRoleEnabled(prefs.agents, 'librarian') &&
    !isAgentRoleEnabled(prefs.agents, 'general')
  ) {
    return
  }

  running = true
  try {
    const recipeId =
      prefs.digestSchedule.period === 'week' ? 'weekly_review' : 'daily_digest'
    const result = await runAgentGoal('', 'library', null, undefined, prefs, {
      recipeId,
      roleId: 'librarian',
    })
    let next: AgentPrefs = bumpAgentRunCount(result.nextPrefs ?? prefs)
    next = {
      ...next,
      digestSchedule: {
        ...next.digestSchedule,
        lastRunDate: todayKey(),
      },
    }
    store.dispatch(setAgentPrefs(next))
    const preview = (result.answer || '').replace(/\s+/g, ' ').slice(0, 140)
    toast.success(
      catchUp && !due
        ? i18n.t('agent.digestScheduleCatchUp')
        : i18n.t('agent.digestScheduleDone'),
      preview || i18n.t('agent.emptyResult'),
      { duration: 12_000 },
    )
  } catch {
    // Soft-fail — never interrupt editing.
  } finally {
    running = false
  }
}

/** Poll while the app is open (no OS cron). Safe to call repeatedly. */
export function startAgentDigestScheduler() {
  if (timer) return
  // On open: catch up if today's slot already passed.
  void tick({ catchUp: true })
  timer = setInterval(() => {
    void tick()
  }, TICK_MS)
}

export function stopAgentDigestScheduler() {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
