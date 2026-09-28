import type { JSONContent } from '@tiptap/core'
import type { Document } from '@/lib/db/api'
import { LruCache } from '@/lib/cache/lru-cache'

/** Insert until this many entries, then drop down to TARGET_ENTRIES. */
const MAX_ENTRIES = 72
const TARGET_ENTRIES = 56
/** Soft cap on cached TipTap JSON so a few huge canvases cannot pin the heap. */
const MAX_CONTENT_CHARS = 10_000_000
const TARGET_CONTENT_CHARS = 7_500_000
/** Soft-stale window for UI that wants SWR without forcing IPC. */
const DEFAULT_FRESH_MS = 60_000

type CacheEntry = {
  document: Document
  contentHash: string | null
  contentLength: number
  parsedContent: JSONContent
  cachedAt: number
  hits: number
}

type CacheListener = (event: { type: 'put' | 'invalidate' | 'clear'; id?: string }) => void

const cache = new LruCache<CacheEntry>({
  maxEntries: MAX_ENTRIES,
  targetEntries: TARGET_ENTRIES,
  maxBytes: MAX_CONTENT_CHARS,
  targetBytes: TARGET_CONTENT_CHARS,
  sizeof: (entry: CacheEntry) => entry.contentLength,
})

const listeners = new Set<CacheListener>()

/** FNV-1a 32-bit. */
export function hashContent(content: string): string {
  let hash = 2166136261
  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function ensureHash(entry: CacheEntry): string {
  if (entry.contentHash === null) {
    entry.contentHash = hashContent(entry.document.contentJson)
  }
  return entry.contentHash
}

function emit(event: { type: 'put' | 'invalidate' | 'clear'; id?: string }) {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      // Listeners must not break cache writes.
    }
  }
}

/**
 * Reuse the TipTap tree when `contentJson` is unchanged (`===` is by value).
 * Hash is lazy — autosave/metadata updates should not scan megabyte JSON.
 */
function buildEntry(document: Document, existing: CacheEntry | undefined): CacheEntry {
  const contentLength = document.contentJson.length
  const now = Date.now()

  if (existing && existing.document.contentJson === document.contentJson) {
    existing.document = document
    existing.contentLength = contentLength
    existing.cachedAt = now
    return existing
  }

  return {
    document,
    contentHash: null,
    contentLength,
    parsedContent: JSON.parse(document.contentJson) as JSONContent,
    cachedAt: now,
    hits: existing?.hits ?? 0,
  }
}

function upsert(document: Document): CacheEntry {
  const previous = cache.peek(document.id)
  const entry = buildEntry(document, previous)
  cache.set(document.id, entry)
  emit({ type: 'put', id: document.id })
  return entry
}

export function cacheDocument(document: Document): Document {
  return upsert(document).document
}

/**
 * Patch title / folder / timestamps without reparsing TipTap JSON.
 * No-op when the id is not cached.
 */
export function patchCachedDocument(
  id: string,
  patch: Partial<Pick<Document, 'title' | 'folderId' | 'filePath' | 'updatedAt' | 'createdAt' | 'vaultVerifier' | 'vaultLocked'>>,
): Document | null {
  const entry = cache.peek(id)
  if (!entry) return null
  entry.document = { ...entry.document, ...patch }
  entry.cachedAt = Date.now()
  cache.set(id, entry)
  emit({ type: 'put', id })
  return entry.document
}

/** Peek without promoting LRU (safe for speculative reads). */
export function peekCachedDocument(id: string): Document | null {
  return cache.peek(id)?.document ?? null
}

/** Peek + promote LRU. Prefer for intentional reads (open tab, active doc). */
export function getCachedDocument(id: string): Document | null {
  const entry = cache.get(id)
  if (!entry) return null
  entry.hits += 1
  return entry.document
}

export function peekCachedParsedContent(id: string): JSONContent | null {
  return cache.peek(id)?.parsedContent ?? null
}

/** Touch + return. Use when you want LRU promotion as a side effect. */
export function getCachedParsedContent(document: Document): JSONContent {
  const entry = upsert(document)
  entry.hits += 1
  cache.touch(document.id)
  return entry.parsedContent
}

export function getCachedContentHash(document: Document): string {
  const entry = upsert(document)
  // Full FNV over multi‑MB JSON stalls open — use identity from metadata instead.
  if (entry.contentHash === null && entry.contentLength > 400_000) {
    entry.contentHash = `u:${document.id}:${document.updatedAt}:${entry.contentLength}`
    return entry.contentHash
  }
  return ensureHash(entry)
}

/** True when cache has an entry with matching `updatedAt` (disk not newer). */
export function isCachedFresh(id: string, updatedAt: number): boolean {
  const entry = cache.peek(id)
  return Boolean(entry && entry.document.updatedAt === updatedAt)
}

/** True when the entry was written within `maxAgeMs` (default 60s). */
export function isCachedRecent(id: string, maxAgeMs: number = DEFAULT_FRESH_MS): boolean {
  const entry = cache.peek(id)
  if (!entry) return false
  return Date.now() - entry.cachedAt <= maxAgeMs
}

export function setRetainedDocumentIds(ids: Iterable<string>) {
  cache.setRetained(ids)
}

export function invalidateDocumentCache(id: string) {
  if (cache.delete(id)) emit({ type: 'invalidate', id })
}

export function clearDocumentCache() {
  cache.clear()
  emit({ type: 'clear' })
}

export function getDocumentCacheSize(): number {
  return cache.size
}

export function getDocumentCacheStats() {
  return {
    ...cache.stats(),
    retainedHint: 'open/active/split docs are pinned via setRetainedDocumentIds',
  }
}

export function subscribeDocumentCache(listener: CacheListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test helper — reset hit counters without clearing entries. */
export function resetDocumentCacheStats() {
  cache.resetStats()
}
