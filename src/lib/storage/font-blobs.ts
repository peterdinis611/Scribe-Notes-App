const DB_NAME = 'scribe-fonts'
const STORE_NAME = 'fonts'
const DB_VERSION = 1

const memoryBackend = new Map<string, string>()

function shouldUseMemoryBackend() {
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

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode)
        const store = transaction.objectStore(STORE_NAME)
        const request = run(store)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
        request.onsuccess = () => resolve(request.result as T)
        transaction.oncomplete = () => db.close()
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('IndexedDB transaction failed'))
      }),
  )
}

export async function fontBlobGet(id: string): Promise<string | null> {
  if (shouldUseMemoryBackend()) {
    return memoryBackend.get(id) ?? null
  }
  const value = await withStore('readonly', (store) => store.get(id))
  return typeof value === 'string' ? value : null
}

export async function fontBlobSet(id: string, value: string): Promise<void> {
  if (shouldUseMemoryBackend()) {
    memoryBackend.set(id, value)
    return
  }
  await withStore('readwrite', (store) => store.put(value, id))
}

export async function fontBlobRemove(id: string): Promise<void> {
  if (shouldUseMemoryBackend()) {
    memoryBackend.delete(id)
    return
  }
  await withStore('readwrite', (store) => store.delete(id))
}
