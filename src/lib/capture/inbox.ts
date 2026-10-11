/**
 * Recent mobile-capture notes queue (local-only).
 * Backend still files into the Inbox folder; this tracks a short UI queue.
 */

import type { CaptureCreatedEvent } from '@/lib/db/capture-api'
import { kvGet, kvSet } from '@/lib/storage/kv'

const KEY = 'scribe.capture.inboxQueue'
const MAX = 40

export type CaptureInboxItem = CaptureCreatedEvent & { receivedAt: number }

export function readCaptureInbox(): CaptureInboxItem[] {
  try {
    const raw = kvGet(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CaptureInboxItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function pushCaptureInbox(event: CaptureCreatedEvent): CaptureInboxItem[] {
  const next: CaptureInboxItem[] = [
    { ...event, receivedAt: Date.now() },
    ...readCaptureInbox().filter((item) => item.documentId !== event.documentId),
  ].slice(0, MAX)
  kvSet(KEY, JSON.stringify(next))
  return next
}

export function clearCaptureInbox() {
  kvSet(KEY, '[]')
}

export function removeCaptureInboxItem(documentId: string): CaptureInboxItem[] {
  const next = readCaptureInbox().filter((item) => item.documentId !== documentId)
  kvSet(KEY, JSON.stringify(next))
  return next
}
