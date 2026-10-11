/** Local registry of canvas note ids (summaries lack contentJson). */

import { kvGet, kvSet } from '@/lib/storage/kv'

const KEY = 'scribe.canvas.documentIds'

function read(): Set<string> {
  try {
    const raw = kvGet(KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function write(ids: Set<string>) {
  kvSet(KEY, JSON.stringify([...ids]))
}

export function markCanvasDocument(id: string) {
  if (!id) return
  const ids = read()
  if (ids.has(id)) return
  ids.add(id)
  write(ids)
}

export function unmarkCanvasDocument(id: string) {
  const ids = read()
  if (!ids.delete(id)) return
  write(ids)
}

export function isKnownCanvasDocument(id: string): boolean {
  return read().has(id)
}

export function knownCanvasDocumentIds(): Set<string> {
  return read()
}
