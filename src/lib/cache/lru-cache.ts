/**
 * Generic LRU map with optional retain pins and byte-budget eviction.
 * Insertion order = LRU (oldest first). Touch moves to newest.
 */

export type LruEvictReason = 'count' | 'bytes'

export type LruCacheStats = {
  size: number
  bytes: number
  hits: number
  misses: number
  evictions: number
  puts: number
}

export type LruCacheOptions<V = unknown> = {
  maxEntries: number
  targetEntries?: number
  maxBytes?: number
  targetBytes?: number
  /** Return approximate cost for an entry (e.g. string length). Default 0. */
  sizeof?: (value: V) => number
}

export class LruCache<V> {
  private readonly store = new Map<string, V>()
  private readonly retained = new Set<string>()
  private readonly maxEntries: number
  private readonly targetEntries: number
  private readonly maxBytes: number
  private readonly targetBytes: number
  private readonly sizeof: (value: V) => number
  private bytes = 0
  private hits = 0
  private misses = 0
  private evictions = 0
  private puts = 0

  constructor(options: LruCacheOptions<V>) {
    this.maxEntries = Math.max(1, options.maxEntries)
    this.targetEntries = Math.max(1, Math.min(options.targetEntries ?? options.maxEntries, this.maxEntries))
    this.maxBytes = options.maxBytes ?? Number.POSITIVE_INFINITY
    this.targetBytes = Math.min(options.targetBytes ?? this.maxBytes, this.maxBytes)
    this.sizeof = options.sizeof ?? (() => 0)
  }

  get size(): number {
    return this.store.size
  }

  get byteSize(): number {
    return this.bytes
  }

  has(key: string): boolean {
    return this.store.has(key)
  }

  peek(key: string): V | undefined {
    const value = this.store.get(key)
    if (value === undefined) {
      this.misses += 1
      return undefined
    }
    this.hits += 1
    return value
  }

  get(key: string): V | undefined {
    const value = this.store.get(key)
    if (value === undefined) {
      this.misses += 1
      return undefined
    }
    this.hits += 1
    this.touch(key)
    return value
  }

  set(key: string, value: V): void {
    const previous = this.store.get(key)
    if (previous !== undefined) {
      this.bytes -= this.sizeof(previous)
      this.store.delete(key)
    }
    this.bytes += this.sizeof(value)
    this.store.set(key, value)
    this.puts += 1
    this.evictIfNeeded()
  }

  delete(key: string): boolean {
    const previous = this.store.get(key)
    if (previous === undefined) return false
    this.bytes -= this.sizeof(previous)
    this.store.delete(key)
    return true
  }

  clear(): void {
    this.store.clear()
    this.retained.clear()
    this.bytes = 0
  }

  keys(): IterableIterator<string> {
    return this.store.keys()
  }

  values(): IterableIterator<V> {
    return this.store.values()
  }

  touch(key: string): boolean {
    const value = this.store.get(key)
    if (value === undefined) return false
    this.store.delete(key)
    this.store.set(key, value)
    return true
  }

  setRetained(ids: Iterable<string>): void {
    this.retained.clear()
    for (const id of ids) {
      if (id) this.retained.add(id)
    }
    for (const id of this.retained) this.touch(id)
    this.evictIfNeeded()
  }

  isRetained(key: string): boolean {
    return this.retained.has(key)
  }

  stats(): LruCacheStats {
    return {
      size: this.store.size,
      bytes: this.bytes,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      puts: this.puts,
    }
  }

  resetStats(): void {
    this.hits = 0
    this.misses = 0
    this.evictions = 0
    this.puts = 0
  }

  private evictIfNeeded(): void {
    const overCount = this.store.size >= this.maxEntries
    const overBytes = this.bytes > this.maxBytes
    if (!overCount && !overBytes) return

    const countFloor = overCount ? this.targetEntries : this.store.size
    const bytesFloor = overBytes ? this.targetBytes : this.maxBytes

    // Pass 1: classic LRU — drop oldest non-retained.
    for (const key of [...this.store.keys()]) {
      if (this.store.size <= countFloor && this.bytes <= bytesFloor) return
      if (this.retained.has(key)) continue
      this.delete(key)
      this.evictions += 1
    }

    // Pass 2: still over byte budget with only retained+large — drop largest non-retained.
    if (this.bytes <= bytesFloor) return
    const candidates = [...this.store.entries()]
      .filter(([key]) => !this.retained.has(key))
      .sort((a, b) => this.sizeof(b[1]) - this.sizeof(a[1]))
    for (const [key] of candidates) {
      if (this.bytes <= bytesFloor) break
      this.delete(key)
      this.evictions += 1
    }
  }
}
