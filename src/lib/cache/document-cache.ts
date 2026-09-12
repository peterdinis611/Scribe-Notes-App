import type { JSONContent } from '@tiptap/core'
import type { Document } from '@/lib/db/api'

/** Soft cap; retained (pinned) ids are never evicted for open tabs. */
const MAX_ENTRIES = 48

type CacheEntry = {
  document: Document
  contentHash: string
  contentLength: number
  parsedContent: JSONContent
}

/**
 * Insertion-ordered Map used as LRU:
 * - re-`set` after `delete` moves an entry to the newest end
 * - eviction drops the oldest (first) key that is not retained
 */
const cache = new Map<string, CacheEntry>()

/** Document ids that must stay warm (open tabs / active / secondary pane). */
const retainedIds = new Set<string>()

export function hashContent(content: string): string {
  // FNV-1a 32-bit — fast, stable, good enough for change detection.
  let hash = 2166136261
  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function touch(id: string, entry: CacheEntry) {
  cache.delete(id)
  cache.set(id, entry)
}

function evictIfNeeded() {
  while (cache.size > MAX_ENTRIES) {
    let evicted = false
    for (const key of cache.keys()) {
      if (retainedIds.has(key)) continue
      cache.delete(key)
      evicted = true
      break
    }
    // Everything left is retained — stop rather than thrashing.
    if (!evicted) break
  }
}

/** Keep these document ids in cache (open tabs). Pass empty to clear pins. */
export function setRetainedDocumentIds(ids: Iterable<string>) {
  retainedIds.clear()
  for (const id of ids) {
    if (id) retainedIds.add(id)
  }
  for (const id of retainedIds) {
    const entry = cache.get(id)
    if (entry) touch(id, entry)
  }
  evictIfNeeded()
}

export function cacheDocument(document: Document): Document {
  const existing = cache.get(document.id)

  // Same object → LRU touch only.
  if (existing?.document === document) {
    touch(document.id, existing)
    return existing.document
  }

  // Same content string instance → reuse hash + parse; refresh metadata document.
  if (existing && existing.document.contentJson === document.contentJson) {
    const entry: CacheEntry = {
      ...existing,
      document,
      contentLength: document.contentJson.length,
    }
    touch(document.id, entry)
    return document
  }

  const contentLength = document.contentJson.length

  // Length + hash match → reuse parse (avoids JSON.parse on title-only updates that
  // somehow got a new string with identical payload).
  if (existing && existing.contentLength === contentLength) {
    const contentHash = hashContent(document.contentJson)
    if (contentHash === existing.contentHash) {
      const entry: CacheEntry = {
        document,
        contentHash,
        contentLength,
        parsedContent: existing.parsedContent,
      }
      touch(document.id, entry)
      return document
    }
    const entry: CacheEntry = {
      document,
      contentHash,
      contentLength,
      parsedContent: JSON.parse(document.contentJson) as JSONContent,
    }
    touch(document.id, entry)
    evictIfNeeded()
    return document
  }

  const contentHash = hashContent(document.contentJson)
  const parsedContent =
    existing && existing.contentHash === contentHash
      ? existing.parsedContent
      : (JSON.parse(document.contentJson) as JSONContent)

  touch(document.id, {
    document,
    contentHash,
    contentLength,
    parsedContent,
  })
  evictIfNeeded()
  return document
}

export function peekCachedDocument(id: string): Document | null {
  const entry = cache.get(id)
  if (!entry) return null
  touch(id, entry)
  return entry.document
}

export function getCachedParsedContent(document: Document): JSONContent {
  cacheDocument(document)
  return cache.get(document.id)!.parsedContent
}

export function getCachedContentHash(document: Document): string {
  cacheDocument(document)
  return cache.get(document.id)!.contentHash
}

/** Peek parsed TipTap JSON without requiring a full Document payload. */
export function peekCachedParsedContent(id: string): JSONContent | null {
  const entry = cache.get(id)
  if (!entry) return null
  touch(id, entry)
  return entry.parsedContent
}

export function invalidateDocumentCache(id: string) {
  cache.delete(id)
}

export function clearDocumentCache() {
  cache.clear()
}

/** Test / diagnostics helper. */
export function getDocumentCacheSize(): number {
  return cache.size
}
