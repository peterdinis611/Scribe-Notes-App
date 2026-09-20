import type { JSONContent } from '@tiptap/core'
import type { Document } from '@/lib/db/api'

/** Insert until this many entries, then drop down to TARGET_ENTRIES. */
const MAX_ENTRIES = 60
const TARGET_ENTRIES = 48
/** Soft cap on cached TipTap JSON so a few huge canvases cannot pin the heap. */
const MAX_CONTENT_CHARS = 8_000_000
const TARGET_CONTENT_CHARS = 6_000_000

type CacheEntry = {
  document: Document
  contentHash: string | null
  contentLength: number
  parsedContent: JSONContent
}

const cache = new Map<string, CacheEntry>()
const retainedIds = new Set<string>()
let totalChars = 0

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

/** Move an existing entry to the newest end of the LRU. */
function touch(id: string): CacheEntry | undefined {
  const entry = cache.get(id)
  if (!entry) return undefined
  cache.delete(id)
  cache.set(id, entry)
  return entry
}

function forget(id: string) {
  const entry = cache.get(id)
  if (!entry) return
  totalChars -= entry.contentLength
  cache.delete(id)
}

function evictIfNeeded() {
  const overCount = cache.size >= MAX_ENTRIES
  const overChars = totalChars > MAX_CONTENT_CHARS
  if (!overCount && !overChars) return

  const countFloor = overCount ? TARGET_ENTRIES : cache.size
  const charsFloor = overChars ? TARGET_CONTENT_CHARS : MAX_CONTENT_CHARS

  for (const key of cache.keys()) {
    if (cache.size <= countFloor && totalChars <= charsFloor) break
    if (retainedIds.has(key)) continue
    forget(key)
  }
}

function put(id: string, entry: CacheEntry) {
  const previous = cache.get(id)
  if (previous) {
    totalChars -= previous.contentLength
    cache.delete(id)
  }
  totalChars += entry.contentLength
  cache.set(id, entry)
  evictIfNeeded()
}

/**
 * Reuse the TipTap tree when `contentJson` is unchanged (`===` is by value).
 * Hash is lazy — autosave/metadata updates should not scan megabyte JSON.
 */
function buildEntry(document: Document, existing: CacheEntry | undefined): CacheEntry {
  const contentLength = document.contentJson.length

  if (existing && existing.document.contentJson === document.contentJson) {
    existing.document = document
    existing.contentLength = contentLength
    return existing
  }

  return {
    document,
    contentHash: null,
    contentLength,
    parsedContent: JSON.parse(document.contentJson) as JSONContent,
  }
}

function upsert(document: Document): CacheEntry {
  const entry = buildEntry(document, cache.get(document.id))
  put(document.id, entry)
  return entry
}

export function cacheDocument(document: Document): Document {
  return upsert(document).document
}

export function peekCachedDocument(id: string): Document | null {
  return cache.get(id)?.document ?? null
}

export function peekCachedParsedContent(id: string): JSONContent | null {
  return cache.get(id)?.parsedContent ?? null
}

/** Touch + return. Use when you want LRU promotion as a side effect. */
export function getCachedParsedContent(document: Document): JSONContent {
  return upsert(document).parsedContent
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

export function setRetainedDocumentIds(ids: Iterable<string>) {
  retainedIds.clear()
  for (const id of ids) if (id) retainedIds.add(id)
  for (const id of retainedIds) touch(id)
  evictIfNeeded()
}

export function invalidateDocumentCache(id: string) {
  forget(id)
}

export function clearDocumentCache() {
  cache.clear()
  retainedIds.clear()
  totalChars = 0
}

export function getDocumentCacheSize(): number {
  return cache.size
}
