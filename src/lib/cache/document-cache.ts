import type { JSONContent } from '@tiptap/core'
import type { Document } from '@/lib/db/api'

const MAX_ENTRIES = 60

type CacheEntry = {
  document: Document
  contentHash: string
  contentLength: number
  parsedContent: JSONContent
}

const cache = new Map<string, CacheEntry>()
const retainedIds = new Set<string>()

/** FNV-1a 32-bit. */
export function hashContent(content: string): string {
  let hash = 2166136261
  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

/** Move an existing entry to the newest end of the LRU. */
function touch(id: string): CacheEntry | undefined {
  const entry = cache.get(id)
  if (!entry) return undefined
  cache.delete(id)
  cache.set(id, entry)
  return entry
}

function evictIfNeeded() {
  if (cache.size <= MAX_ENTRIES) return
  for (const key of cache.keys()) {
    if (cache.size <= MAX_ENTRIES) break
    if (retainedIds.has(key)) continue
    cache.delete(key)
  }
}

/**
 * Decide whether the parsed content can be reused and produce the new entry.
 * Pure function — no mutation of `cache`.
 */
function buildEntry(document: Document, existing: CacheEntry | undefined): CacheEntry {
  const contentLength = document.contentJson.length

  // Fast path: identical content string instance.
  if (existing && existing.document.contentJson === document.contentJson) {
    return { ...existing, document, contentLength }
  }

  // Compute hash lazily — only when we might reuse or need to store it.
  const contentHash = hashContent(document.contentJson)

  const parsedContent =
    existing?.contentHash === contentHash
      ? existing.parsedContent // same content → reuse parse
      : (JSON.parse(document.contentJson) as JSONContent)

  return { document, contentHash, contentLength, parsedContent }
}

export function cacheDocument(document: Document): Document {
  const existing = cache.get(document.id)
  const entry = buildEntry(document, existing)
  cache.set(document.id, entry)
  evictIfNeeded()
  return entry.document
}

export function peekCachedDocument(id: string): Document | null {
  return cache.get(id)?.document ?? null
}

export function peekCachedParsedContent(id: string): JSONContent | null {
  return cache.get(id)?.parsedContent ?? null
}

/** Touch + return. Use when you want LRU promotion as a side effect. */
export function getCachedParsedContent(document: Document): JSONContent {
  return cacheDocument(document) && cache.get(document.id)!.parsedContent
}

export function getCachedContentHash(document: Document): string {
  cacheDocument(document)
  return cache.get(document.id)!.contentHash
}

export function setRetainedDocumentIds(ids: Iterable<string>) {
  retainedIds.clear()
  for (const id of ids) if (id) retainedIds.add(id)
  for (const id of retainedIds) touch(id)
  evictIfNeeded()
}

export function invalidateDocumentCache(id: string) {
  cache.delete(id)
}

export function clearDocumentCache() {
  cache.clear()
  retainedIds.clear()
}

export function getDocumentCacheSize(): number {
  return cache.size
}