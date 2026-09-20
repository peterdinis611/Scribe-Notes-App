import { peekCachedDocument } from '@/lib/cache/document-cache'
import { getDocument } from '@/lib/db/api'

/** Warm the document cache without blocking navigation. */
export function prefetchDocument(id: string | null | undefined) {
  if (!id) return
  if (peekCachedDocument(id)) return
  void getDocument(id).catch(() => undefined)
}

/**
 * Prefetch a capped set of open tabs so large libraries do not flood IPC.
 * Prefer calling with active id first in `ids`.
 */
export function prefetchOpenDocuments(ids: string[], options?: { limit?: number }) {
  const limit = options?.limit ?? 6
  let scheduled = 0
  for (const id of ids) {
    if (!id || scheduled >= limit) break
    if (peekCachedDocument(id)) continue
    prefetchDocument(id)
    scheduled += 1
  }
}

/** Start downloading editor bundles so Suspense rarely blocks after content arrives. */
export function prefetchEditorChunks() {
  void import('@/components/DocumentEditor')
  void import('@/components/canvas/CanvasEditor')
}
