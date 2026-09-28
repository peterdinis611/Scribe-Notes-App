import { peekCachedDocument } from '@/lib/cache/document-cache'
import { getDocument } from '@/lib/db/api'

export type PrefetchPriority = 'high' | 'normal' | 'low'

type PrefetchJob = {
  id: string
  priority: PrefetchPriority
}

const PRIORITY_RANK: Record<PrefetchPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
}

const MAX_CONCURRENT = 2
const queue: PrefetchJob[] = []
const queued = new Set<string>()
const inflight = new Set<string>()
let active = 0

function sortQueue() {
  queue.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()
    if (!job) break
    queued.delete(job.id)
    if (peekCachedDocument(job.id) || inflight.has(job.id)) continue

    active += 1
    inflight.add(job.id)
    void getDocument(job.id)
      .catch(() => undefined)
      .finally(() => {
        inflight.delete(job.id)
        active -= 1
        pump()
      })
  }
}

function enqueue(id: string, priority: PrefetchPriority) {
  if (!id) return
  if (peekCachedDocument(id) || inflight.has(id)) return

  const existing = queue.find((job) => job.id === id)
  if (existing) {
    if (PRIORITY_RANK[priority] < PRIORITY_RANK[existing.priority]) {
      existing.priority = priority
      sortQueue()
    }
    return
  }

  queued.add(id)
  queue.push({ id, priority })
  sortQueue()
  pump()
}

/** Warm the document cache without blocking navigation. */
export function prefetchDocument(
  id: string | null | undefined,
  priority: PrefetchPriority = 'normal',
) {
  if (!id) return
  enqueue(id, priority)
}

/**
 * Prefetch a capped set of open tabs so large libraries do not flood IPC.
 * Prefer calling with active id first in `ids`.
 */
export function prefetchOpenDocuments(
  ids: string[],
  options?: { limit?: number; priority?: PrefetchPriority },
) {
  const limit = options?.limit ?? 6
  const priority = options?.priority ?? 'high'
  let scheduled = 0
  for (const id of ids) {
    if (!id || scheduled >= limit) break
    if (peekCachedDocument(id)) continue
    prefetchDocument(id, priority)
    scheduled += 1
  }
}

/** Drop pending low/normal work (e.g. on library switch). In-flight stays. */
export function clearPrefetchQueue(options?: { keepHigh?: boolean }) {
  const keepHigh = options?.keepHigh ?? false
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    const job = queue[i]
    if (keepHigh && job.priority === 'high') continue
    queued.delete(job.id)
    queue.splice(i, 1)
  }
}

export function getPrefetchQueueSize(): number {
  return queue.length + inflight.size
}

/** Start downloading editor bundles so Suspense rarely blocks after content arrives. */
export function prefetchEditorChunks() {
  void import('@/components/DocumentEditor')
  void import('@/components/canvas/CanvasEditor')
}
