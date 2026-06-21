import type { JSONContent } from '@tiptap/core'
import type { Document } from '@/lib/db/api'

const MAX_ENTRIES = 12

type CacheEntry = {
  document: Document
  contentHash: string
  parsedContent: JSONContent
  lastAccessed: number
}

const cache = new Map<string, CacheEntry>()

export function hashContent(content: string): string {
  let hash = 2166136261
  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function evictIfNeeded() {
  if (cache.size <= MAX_ENTRIES) return

  let oldestKey: string | null = null
  let oldestAccess = Infinity

  for (const [key, entry] of cache) {
    if (entry.lastAccessed < oldestAccess) {
      oldestAccess = entry.lastAccessed
      oldestKey = key
    }
  }

  if (oldestKey) cache.delete(oldestKey)
}

export function cacheDocument(document: Document): Document {
  const contentHash = hashContent(document.contentJson)
  const existing = cache.get(document.id)

  if (
    existing &&
    existing.contentHash === contentHash &&
    existing.document.updatedAt === document.updatedAt
  ) {
    existing.lastAccessed = Date.now()
    return existing.document
  }

  const parsedContent =
    existing?.contentHash === contentHash
      ? existing.parsedContent
      : (JSON.parse(document.contentJson) as JSONContent)

  cache.set(document.id, {
    document,
    contentHash,
    parsedContent,
    lastAccessed: Date.now(),
  })
  evictIfNeeded()
  return document
}

export function peekCachedDocument(id: string): Document | null {
  const entry = cache.get(id)
  if (!entry) return null
  entry.lastAccessed = Date.now()
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

export function invalidateDocumentCache(id: string) {
  cache.delete(id)
}

export function clearDocumentCache() {
  cache.clear()
}
