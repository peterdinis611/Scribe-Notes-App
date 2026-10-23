import { kvGet, kvSet } from '@/lib/storage/kv'
import {
  cardKey,
  defaultSm2State,
  isDue,
  reviewSm2,
  type Sm2Grade,
  type Sm2State,
} from '@/lib/flashcards/sm2'

const KEY = 'scribe.flashcards.sm2.v1'

type Store = Record<string, Sm2State>

function readStore(): Store {
  try {
    const raw = kvGet(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Store
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: Store) {
  kvSet(KEY, JSON.stringify(store))
}

export function getCardState(documentId: string, front: string, answer: string): Sm2State {
  const store = readStore()
  return store[cardKey(documentId, front, answer)] ?? defaultSm2State()
}

export function gradeCard(
  documentId: string,
  front: string,
  answer: string,
  grade: Sm2Grade,
  now = Date.now(),
): Sm2State {
  const store = readStore()
  const key = cardKey(documentId, front, answer)
  const next = reviewSm2(store[key] ?? defaultSm2State(now), grade, now)
  store[key] = next
  writeStore(store)
  return next
}

export function listDueKeys(documentId: string | null, now = Date.now()): string[] {
  const store = readStore()
  return Object.entries(store)
    .filter(([key, state]) => {
      if (documentId && !key.startsWith(`${documentId}::`)) return false
      return isDue(state, now)
    })
    .map(([key]) => key)
}

export function dueCountForDocument(documentId: string, cardCount: number, now = Date.now()): number {
  const store = readStore()
  let seen = 0
  for (const [key, state] of Object.entries(store)) {
    if (!key.startsWith(`${documentId}::`)) continue
    seen += 1
    if (!isDue(state, now)) cardCount -= 1
  }
  // Unseen cards are due.
  const unseen = Math.max(0, cardCount - seen)
  const dueKnown = Object.entries(store).filter(
    ([key, state]) => key.startsWith(`${documentId}::`) && isDue(state, now),
  ).length
  return dueKnown + unseen
}
