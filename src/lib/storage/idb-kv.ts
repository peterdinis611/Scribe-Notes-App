const DB_NAME = 'scribe-kv'
const STORE_NAME = 'kv'
const DB_VERSION = 1

const memoryBackend = new Map<string, string>()

function useMemoryBackend() {
  return import.meta.env.VITEST === true || typeof indexedDB === 'undefined'
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode)
        const store = transaction.objectStore(STORE_NAME)
        const request = run(store)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
        request.onsuccess = () => resolve(request.result as T)
        transaction.oncomplete = () => db.close()
        transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
      }),
  )
}

export async function idbGetAll(): Promise<Map<string, string>> {
  if (useMemoryBackend()) {
    return new Map(memoryBackend)
  }

  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const map = new Map<string, string>()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.openCursor()

    request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor failed'))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        db.close()
        resolve(map)
        return
      }
      map.set(String(cursor.key), String(cursor.value))
      cursor.continue()
    }
  })
}

export async function idbSet(key: string, value: string): Promise<void> {
  if (useMemoryBackend()) {
    memoryBackend.set(key, value)
    return
  }
  await withStore('readwrite', (store) => store.put(value, key))
}

export async function idbRemove(key: string): Promise<void> {
  if (useMemoryBackend()) {
    memoryBackend.delete(key)
    return
  }
  await withStore('readwrite', (store) => store.delete(key))
}

export async function idbClear(): Promise<void> {
  if (useMemoryBackend()) {
    memoryBackend.clear()
    return
  }
  await withStore('readwrite', (store) => store.clear())
}
