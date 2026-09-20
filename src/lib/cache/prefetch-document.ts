import { peekCachedDocument } from '@/lib/cache/document-cache'
import { getDocument } from '@/lib/db/api'

/** Warm the document cache without blocking navigation. */
export function prefetchDocument(id: string | null | undefined) {
  if (!id) return
  if (peekCachedDocument(id)) return
  void getDocument(id).catch(() => undefined)
}

/** Start downloading editor bundles so Suspense rarely blocks after content arrives. */
export function prefetchEditorChunks() {
  void import('@/components/DocumentEditor')
  void import('@/components/canvas/CanvasEditor')
}
