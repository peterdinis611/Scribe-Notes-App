import { Debouncer } from '@/lib/pacer'
import { nlpIndexDocument, nlpStatus, type NlpStatus } from '@/lib/db/nlp-api'

/** Debounce after save — longer for heavier embed backends. */
export const INDEX_DELAY_HASH_MS = 2500
export const INDEX_DELAY_FAST_MS = 5000
export const INDEX_DELAY_QUALITY_MS = 10_000

const STATUS_CACHE_MS = 30_000

type Entry = {
  wait: number
  debouncer: Debouncer<() => void>
}

const debouncers = new Map<string, Entry>()
let cachedStatus: { at: number; status: NlpStatus } | null = null

function delayForBackend(backend: string | undefined): number {
  switch ((backend ?? 'hash').toLowerCase()) {
    case 'quality':
      return INDEX_DELAY_QUALITY_MS
    case 'fast':
      return INDEX_DELAY_FAST_MS
    default:
      return INDEX_DELAY_HASH_MS
  }
}

async function getStatus(): Promise<NlpStatus> {
  const now = Date.now()
  if (cachedStatus && now - cachedStatus.at < STATUS_CACHE_MS) {
    return cachedStatus.status
  }
  const status = await nlpStatus()
  cachedStatus = { at: now, status }
  return status
}

/** Drop cached NLP status (e.g. after embed backend change). */
export function invalidateNlpAutoIndexStatus() {
  cachedStatus = null
}

async function indexDocument(documentId: string) {
  const status = await getStatus()
  if (!status.enabled || !status.sidecarOk) return
  await nlpIndexDocument(documentId)
}

function getDebouncer(documentId: string, wait: number): Debouncer<() => void> {
  const existing = debouncers.get(documentId)
  if (existing && existing.wait === wait) {
    return existing.debouncer
  }
  existing?.debouncer.cancel()
  const debouncer = new Debouncer(
    () => {
      void indexDocument(documentId)
    },
    { wait },
  )
  debouncers.set(documentId, { wait, debouncer })
  return debouncer
}

/** Queue a debounced NLP reindex after the document is saved. */
export function scheduleNlpDocumentIndex(documentId: string) {
  void (async () => {
    const status = await getStatus()
    if (!status.enabled || !status.sidecarOk) return
    getDebouncer(documentId, delayForBackend(status.embedBackend)).maybeExecute()
  })()
}

export function flushNlpDocumentIndex(documentId: string) {
  const entry = debouncers.get(documentId)
  if (!entry) return
  entry.debouncer.flush()
}

export function cancelNlpDocumentIndex(documentId: string) {
  const entry = debouncers.get(documentId)
  if (!entry) return
  entry.debouncer.cancel()
  debouncers.delete(documentId)
}
