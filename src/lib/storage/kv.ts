import { idbClear, idbGetAll, idbRemove, idbSet } from '@/lib/storage/idb-kv'

const MIGRATED_FROM_LOCAL_STORAGE_KEY = 'scribe-kv-migrated-from-localstorage'

const cache = new Map<string, string>()
let hydrated = false
let hydratePromise: Promise<void> | null = null

function isScribeStorageKey(key: string) {
  return key.startsWith('scribe-') || key.startsWith('scribe_')
}

function migrateFromLocalStorage() {
  if (typeof localStorage === 'undefined') return

  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key && isScribeStorageKey(key)) {
        keys.push(key)
      }
    }

    for (const key of keys) {
      const value = localStorage.getItem(key)
      if (value !== null) {
        cache.set(key, value)
        void idbSet(key, value)
        localStorage.removeItem(key)
      }
    }
  } catch {
    // ignore migration errors
  }
}

export async function hydrateKvStore(): Promise<void> {
  if (hydrated) return hydratePromise ?? Promise.resolve()
  if (!hydratePromise) {
    hydratePromise = (async () => {
      const stored = await idbGetAll()
      for (const [key, value] of stored) {
        cache.set(key, value)
      }

      if (cache.get(MIGRATED_FROM_LOCAL_STORAGE_KEY) !== '1') {
        migrateFromLocalStorage()
        cache.set(MIGRATED_FROM_LOCAL_STORAGE_KEY, '1')
        await idbSet(MIGRATED_FROM_LOCAL_STORAGE_KEY, '1')
      }

      hydrated = true
    })()
  }
  return hydratePromise
}

export function kvGet(key: string): string | null {
  return cache.get(key) ?? null
}

export function kvSet(key: string, value: string) {
  cache.set(key, value)
  void idbSet(key, value)
}

export function kvRemove(key: string) {
  cache.delete(key)
  void idbRemove(key)
}

export function kvGetJson<T>(key: string): T | null {
  const raw = kvGet(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function kvSetJson(key: string, value: unknown) {
  kvSet(key, JSON.stringify(value))
}

export async function resetKvStoreForTests(): Promise<void> {
  cache.clear()
  hydrated = false
  hydratePromise = null
  await idbClear()
}
