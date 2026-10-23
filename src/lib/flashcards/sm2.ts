/** Lightweight SM-2 scheduling for local flashcard review (Anki-compatible grades). */

export type Sm2Grade = 'again' | 'hard' | 'good' | 'easy'

export type Sm2State = {
  /** Ease factor (≥ 1.3). */
  ease: number
  /** Interval in days. */
  interval: number
  repetitions: number
  /** Next due timestamp (ms). */
  dueAt: number
  lapses: number
}

export function cardKey(documentId: string, front: string, answer: string): string {
  return `${documentId}::${front.trim()}::${answer.trim()}`
}

export function defaultSm2State(now = Date.now()): Sm2State {
  return {
    ease: 2.5,
    interval: 0,
    repetitions: 0,
    dueAt: now,
    lapses: 0,
  }
}

export function isDue(state: Sm2State, now = Date.now()): boolean {
  return state.dueAt <= now
}

/** Classic SM-2 with Again=0, Hard=2, Good=3, Easy=4 style mapping. */
export function reviewSm2(state: Sm2State, grade: Sm2Grade, now = Date.now()): Sm2State {
  let { ease, interval } = state
  const { repetitions, lapses } = state

  if (grade === 'again') {
    return {
      ease: Math.max(1.3, ease - 0.2),
      interval: 0,
      repetitions: 0,
      dueAt: now + 10 * 60 * 1000,
      lapses: lapses + 1,
    }
  }

  const quality = grade === 'hard' ? 2 : grade === 'good' ? 3 : 4
  ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))

  if (repetitions === 0) {
    interval = grade === 'hard' ? 1 : 1
  } else if (repetitions === 1) {
    interval = grade === 'hard' ? 3 : grade === 'easy' ? 4 : 6
  } else {
    const factor = grade === 'hard' ? Math.max(1.2, ease - 0.15) : grade === 'easy' ? ease * 1.3 : ease
    interval = Math.max(1, Math.round(interval * factor))
  }

  return {
    ease,
    interval,
    repetitions: repetitions + 1,
    dueAt: now + interval * 24 * 60 * 60 * 1000,
    lapses,
  }
}
