/** Queue a local video insert when navigating from Storage mode into the editor. */

export type PendingVideoInsert = {
  path: string
  title?: string | null
  libraryVideoId?: string | null
  documentId: string
}

const KEY = 'scribe-pending-video-insert'

export function queuePendingVideoInsert(payload: PendingVideoInsert) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function takePendingVideoInsert(documentId: string): PendingVideoInsert | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingVideoInsert
    if (!parsed?.path || parsed.documentId !== documentId) return null
    sessionStorage.removeItem(KEY)
    return parsed
  } catch {
    return null
  }
}
